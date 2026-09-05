package phpfpm

import (
	"bytes"
	"context"
	"fmt"
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
		// Use GetRouter to prevent GoFrame from parsing and draining the form POST body
		filePath := "/" + r.GetRouter("any").String()

		// If the file path contains "..", return 404 to prevent directory traversal
		if strings.Contains(filePath, "..") {
			r.Response.WriteHeader(404)
			return
		}

		// Check if the file path is empty
		if filePath == "/" {
			filePath = "/index.php"
		}

		// Serve custom theme assets directly from conf/webmail/theme if requested
		if strings.HasPrefix(filePath, "/theme/") {
			themePath := filepath.Join("../conf/webmail", filePath)
			if info, err := os.Stat(themePath); err == nil && !info.IsDir() {
				r.Response.ServeFile(themePath)
				return
			}
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

			r.Response.ServeFile(filepath.Join(config.Static, filePath))
			return
		}

		https := "off"
		if r.GetSchema() == "https" {
			https = "on"
		}

		// Get the remote address
		remoteAddr, _, _ := net.SplitHostPort(r.RemoteAddr)
		if remoteAddr == "" {
			remoteAddr = r.RemoteAddr
		}

		// Extract actual server listening port instead of ephemeral client port
		serverPort := "80"
		if https == "on" {
			serverPort = "443"
		}
		if host := r.Host; strings.Contains(host, ":") {
			_, p, err := net.SplitHostPort(host)
			if err == nil && p != "" {
				serverPort = p
			}
		}

		// Read and buffer request body safely so form POSTs (replies, sends, drafts) are preserved
		var bodyBytes []byte
		if r.Body != nil {
			bodyBytes, _ = io.ReadAll(r.Body)
		}

		contentLength := r.Header.Get("Content-Length")
		if len(bodyBytes) > 0 && (contentLength == "" || contentLength == "0") {
			contentLength = fmt.Sprintf("%d", len(bodyBytes))
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
			"SERVER_NAME":       r.Host,
			"SERVER_PORT":       serverPort,
			"SERVER_PROTOCOL":   r.Proto,
			"HTTPS":             https,
			"REQUEST_TIME":      gconv.String(time.Now().Unix()),
			"PATH_INFO":         "",
			"DOCUMENT_ROOT":     config.Root,
			"GATEWAY_INTERFACE": "CGI/1.1",
			"SERVER_SOFTWARE":   "gf",
		}

		// Add all HTTP headers to environment with HTTP_ prefix
		for headerName, headerValues := range r.Header {
			if len(headerValues) > 0 {
				headerName = strings.ReplaceAll(strings.ToUpper(headerName), "-", "_")
				if headerName != "CONTENT_TYPE" && headerName != "CONTENT_LENGTH" {
					env["HTTP_"+headerName] = headerValues[0]
				}
			}
		}

		// Connect to FastCGI server
		fc, err := fcgiclient.Dial(config.Network, config.Addr)
		if err != nil {
			g.Log().Error(context.Background(), "FastCGI connection failed:", err)
			r.Response.WriteHeader(502)
			return
		}
		defer fc.Close()

		// Send request to FastCGI server with buffered body
		resp, err := fc.Request(env, bytes.NewReader(bodyBytes))
		if err != nil {
			g.Log().Error(context.Background(), "FastCGI request failed:", err)
			r.Response.WriteHeader(502)
			return
		}
		defer resp.Body.Close()

		// Check if the response is HTML for modern theme injection
		isHTML := strings.Contains(strings.ToLower(resp.Header.Get("Content-Type")), "text/html")
		var respBody []byte
		if isHTML {
			respBody, _ = io.ReadAll(resp.Body)

			themeCSS := `<link rel="stylesheet" href="/roundcube/theme/theme.css?v=2.5">`
			themeJS := `<script src="/roundcube/theme/theme.js?v=2.5" defer></script>`

			if bytes.Contains(respBody, []byte("</head>")) {
				respBody = bytes.Replace(respBody, []byte("</head>"), []byte(themeCSS+"\n</head>"), 1)
			}
			if bytes.Contains(respBody, []byte("</body>")) {
				respBody = bytes.Replace(respBody, []byte("</body>"), []byte(themeJS+"\n</body>"), 1)
			}
		}

		// CRITICAL FIX: Copy headers from PHP response BEFORE calling WriteHeader
		for key, values := range resp.Header {
			if isHTML && strings.EqualFold(key, "Content-Length") {
				continue // Will be recalculated
			}
			for _, value := range values {
				r.Response.Header().Add(key, value)
			}
		}

		if isHTML {
			r.Response.Header().Set("Content-Length", strconv.Itoa(len(respBody)))
		}

		// Set response status code
		r.Response.WriteHeader(resp.StatusCode)

		// Write response body
		if isHTML {
			r.Response.Write(respBody)
		} else {
			_, err = io.Copy(r.Response.BufferWriter, resp.Body)
			if err != nil {
				g.Log().Error(context.Background(), "FastCGI response failed:", err)
				return
			}
		}
	}
}

