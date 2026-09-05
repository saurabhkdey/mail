package phpfpm

import (
	"bytes"
	"context"
	"io"
	"net"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/gogf/gf/v2/frame/g"
	"github.com/gogf/gf/v2/net/ghttp"
	"github.com/gogf/gf/v2/util/gconv"
	"github.com/tomasen/fcgi_client"
)

// PHPFpmHandlerConfig holds the configuration for the PHP-FPM handler.
type PHPFpmHandlerConfig struct {
	Network string // Network type (tcp, unix)
	Addr    string // Address of the FastCGI server
	Root    string // Document root for PHP files
	Static  string // Serve static files directly
}

// PHPFpmHandlerFactory creates a handler function for PHP-FPM.
func PHPFpmHandlerFactory(config PHPFpmHandlerConfig) ghttp.HandlerFunc {
	return func(r *ghttp.Request) {
		// Ensure trailing slash for /roundcube
		if r.URL.Path == "/roundcube" {
			target := "/roundcube/"
			if r.URL.RawQuery != "" {
				target += "?" + r.URL.RawQuery
			}
			r.Response.RedirectTo(target)
			return
		}

		// Get the requested file path using GetRouter to avoid draining the request body
		rawPath := r.GetRouter("any").String()
		if rawPath == "" {
			rawPath = "/"
		} else if !strings.HasPrefix(rawPath, "/") {
			rawPath = "/" + rawPath
		}
		filePath := rawPath

		// If the file path contains "..", return 404 to prevent directory traversal
		if strings.Contains(filePath, "..") {
			r.Response.WriteHeader(404)
			return
		}

		// Serve modern theme assets directly
		if strings.HasPrefix(filePath, "/_modern/") {
			serveModernAsset(r, filePath)
			return
		}

		// Check if the file path is empty or root
		if filePath == "/" {
			filePath = "/index.php"
		}

		// Serve static files directly
		if !strings.HasSuffix(filePath, ".php") {
			absFilePath, err := filepath.Abs(config.Static)
			if err != nil {
				g.Log().Error(context.Background(), "Failed to get absolute path:", err)
				r.Response.WriteStatus(500)
				return
			}

			absPath := filepath.Join(absFilePath, filePath)

			// Prevent directory traversal attacks
			if !strings.HasPrefix(absPath, absFilePath) {
				g.Log().Error(context.Background(), "Directory traversal attempt:", absPath)
				r.Response.WriteStatus(403)
				return
			}

			// Check if file actually exists before serving
			if fi, err := os.Stat(absPath); err != nil || fi.IsDir() {
				r.Response.WriteHeader(404)
				return
			}

			r.Response.ServeFile(absPath)
			return
		}

		// HTTPS detection (direct and reverse-proxy)
		https := "off"
		if r.GetSchema() == "https" ||
			strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https") ||
			strings.EqualFold(r.Header.Get("Front-End-Https"), "on") {
			https = "on"
		}

		// Client IP detection
		remoteAddr := r.GetClientIp()
		if remoteAddr == "" {
			remoteAddr, _, _ = net.SplitHostPort(r.RemoteAddr)
		}

		// Server name and port detection (do not use client ephemeral port)
		serverName := r.Host
		serverPort := "80"
		if https == "on" {
			serverPort = "443"
		}
		if h, p, err := net.SplitHostPort(r.Host); err == nil {
			serverName = h
			serverPort = p
		} else if fwdPort := r.Header.Get("X-Forwarded-Port"); fwdPort != "" {
			serverPort = fwdPort
		}

		// Prepare request body safely for FastCGI
		var bodyReader io.Reader = r.Body
		contentLength := r.Header.Get("Content-Length")
		if r.Method == "POST" || r.Method == "PUT" || r.Method == "PATCH" {
			bodyBytes := r.GetBody()
			bodyReader = bytes.NewReader(bodyBytes)
			contentLength = strconv.Itoa(len(bodyBytes))
		}

		// Create environment variables for FastCGI
		env := map[string]string{
			"SCRIPT_FILENAME":   filepath.Join(config.Root, filePath),
			"REQUEST_METHOD":    r.Method,
			"SCRIPT_NAME":       "/roundcube" + filePath,
			"REQUEST_URI":       r.RequestURI,
			"QUERY_STRING":      r.URL.RawQuery,
			"CONTENT_TYPE":      r.Header.Get("Content-Type"),
			"CONTENT_LENGTH":    contentLength,
			"REMOTE_ADDR":       remoteAddr,
			"SERVER_NAME":       serverName,
			"SERVER_PORT":       serverPort,
			"SERVER_PROTOCOL":   r.Proto,
			"HTTPS":             https,
			"REQUEST_TIME":      gconv.String(time.Now().Unix()),
			"PATH_INFO":         "",
			"DOCUMENT_ROOT":     config.Root,
			"DOCUMENT_URI":      "/roundcube" + filePath,
			"GATEWAY_INTERFACE": "CGI/1.1",
			"SERVER_SOFTWARE":   "BillionMail/GoFrame",
			"REDIRECT_STATUS":   "200",
		}

		// Add all HTTP headers to environment with HTTP_ prefix
		for headerName, headerValues := range r.Header {
			if len(headerValues) > 0 {
				normHeader := strings.ReplaceAll(strings.ToUpper(headerName), "-", "_")
				if normHeader != "CONTENT_TYPE" && normHeader != "CONTENT_LENGTH" {
					env["HTTP_"+normHeader] = strings.Join(headerValues, ", ")
				}
			}
		}

		if https == "on" {
			env["HTTP_X_FORWARDED_PROTO"] = "https"
		}

		// Connect to FastCGI server
		fc, err := fcgiclient.Dial(config.Network, config.Addr)
		if err != nil {
			g.Log().Error(context.Background(), "FastCGI connection failed:", err)
			r.Response.WriteStatus(502, "FastCGI Service Unavailable")
			return
		}
		defer fc.Close()

		// Send request to FastCGI server
		resp, err := fc.Request(env, bodyReader)
		if err != nil {
			g.Log().Error(context.Background(), "FastCGI request failed:", err)
			r.Response.WriteStatus(502, "FastCGI Request Error")
			return
		}
		defer resp.Body.Close()

		// Copy headers from PHP response to our response FIRST before calling WriteHeader
		contentType := ""
		for key, values := range resp.Header {
			for _, value := range values {
				r.Response.Header().Add(key, value)
			}
			if strings.EqualFold(key, "Content-Type") && len(values) > 0 {
				contentType = values[0]
			}
		}

		// If this is an HTML response, inject modern theme assets before </head>
		if strings.Contains(strings.ToLower(contentType), "text/html") {
			bodyBytes, err := io.ReadAll(resp.Body)
			if err == nil {
				injection := "\n<!-- BillionMail Modern Roundcube Theme -->\n" +
					"<link rel=\"stylesheet\" type=\"text/css\" href=\"/roundcube/_modern/theme.css?v=2.1\">\n" +
					"<script type=\"text/javascript\" src=\"/roundcube/_modern/theme.js?v=2.1\"></script>\n"

				headIdx := bytes.Index(bodyBytes, []byte("</head>"))
				if headIdx != -1 {
					var modified bytes.Buffer
					modified.Write(bodyBytes[:headIdx])
					modified.WriteString(injection)
					modified.Write(bodyBytes[headIdx:])
					bodyBytes = modified.Bytes()
				}

				r.Response.Header().Set("Content-Length", strconv.Itoa(len(bodyBytes)))
				r.Response.WriteHeader(resp.StatusCode)
				_, _ = r.Response.Write(bodyBytes)
				return
			}
		}

		// Non-HTML response (JSON, attachments, images, etc.)
		r.Response.WriteHeader(resp.StatusCode)
		_, err = io.Copy(r.Response.BufferWriter, resp.Body)
		if err != nil {
			g.Log().Error(context.Background(), "FastCGI response copy failed:", err)
			return
		}
	}
}

// serveModernAsset serves modern theme CSS and JS directly from disk or fallback
func serveModernAsset(r *ghttp.Request, filePath string) {
	switch filePath {
	case "/_modern/theme.css":
		r.Response.Header().Set("Content-Type", "text/css; charset=utf-8")
		r.Response.Header().Set("Cache-Control", "public, max-age=86400")
		// Try loading from relative or container conf paths
		candidates := []string{
			"conf/webmail/theme/theme.css",
			"../conf/webmail/theme/theme.css",
			"/opt/billionmail/conf/webmail/theme/theme.css",
		}
		for _, path := range candidates {
			if data, err := os.ReadFile(path); err == nil {
				r.Response.Write(data)
				return
			}
		}
		r.Response.Write(modernThemeCSSFallback)

	case "/_modern/theme.js":
		r.Response.Header().Set("Content-Type", "application/javascript; charset=utf-8")
		r.Response.Header().Set("Cache-Control", "public, max-age=86400")
		candidates := []string{
			"conf/webmail/theme/theme.js",
			"../conf/webmail/theme/theme.js",
			"/opt/billionmail/conf/webmail/theme/theme.js",
		}
		for _, path := range candidates {
			if data, err := os.ReadFile(path); err == nil {
				r.Response.Write(data)
				return
			}
		}
		r.Response.Write(modernThemeJSFallback)

	default:
		r.Response.WriteHeader(404)
	}
}

var modernThemeCSSFallback = []byte(`
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
:root {
  --bm-primary: #4f46e5;
  --bm-primary-hover: #4338ca;
  --bm-primary-gradient: linear-gradient(135deg, #4f46e5 0%, #6366f1 100%);
  --bm-radius: 10px;
}
body { font-family: 'Inter', system-ui, -apple-system, sans-serif !important; }
.btn-primary, .button.mainaction, a.button.send, .btn.send {
  background: var(--bm-primary-gradient) !important;
  color: #fff !important;
  border-radius: var(--bm-radius) !important;
  box-shadow: 0 4px 14px rgba(79, 70, 229, 0.35) !important;
}
blockquote {
  border-left: 3px solid var(--bm-primary) !important;
  background: rgba(79, 70, 229, 0.04) !important;
  padding: 0.75rem 1rem !important;
  border-radius: 0 var(--bm-radius) var(--bm-radius) 0 !important;
}
`)

var modernThemeJSFallback = []byte(`
(function(){
  document.addEventListener('DOMContentLoaded', function(){
    var cb = document.getElementById('composebody');
    if (cb) { cb.focus(); }
  });
})();
`)
