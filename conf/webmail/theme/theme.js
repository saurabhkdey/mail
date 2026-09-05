/**
 * BillionMail Modern Roundcube Experience
 * - Gmail-Style Bottom Action Pills (Reply, Reply All, Forward)
 * - Expandable ••• Trimmed Content Toggle for quoted emails
 * - Ctrl+Enter / Cmd+Enter Instant Send shortcut
 * - Smooth integration with Elastic skin & iframes
 */

(function () {
  'use strict';

  function getRcmail() {
    if (typeof window.rcmail !== 'undefined') return window.rcmail;
    if (window.parent && typeof window.parent.rcmail !== 'undefined') return window.parent.rcmail;
    return null;
  }

  // 1. Inject Bottom Action Pills in Message Reading View
  function initActionPills() {
    var targets = [
      document.querySelector('#messagecontent'),
      document.querySelector('#message-html'),
      document.querySelector('#messagebody'),
      document.querySelector('.message-part')
    ];

    var container = null;
    for (var i = 0; i < targets.length; i++) {
      if (targets[i]) {
        container = targets[i];
        break;
      }
    }

    if (!container) return;
    if (document.querySelector('.bm-action-pills-container')) return;

    var pillBox = document.createElement('div');
    pillBox.className = 'bm-action-pills-container';

    // Reply Button
    var replyBtn = document.createElement('button');
    replyBtn.type = 'button';
    replyBtn.className = 'bm-action-pill bm-reply-btn';
    replyBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z"/></svg> <span>Reply</span>';
    replyBtn.onclick = function (e) {
      e.preventDefault();
      var rc = getRcmail();
      if (rc) rc.command('reply', '', this, e);
    };

    // Reply All Button
    var replyAllBtn = document.createElement('button');
    replyAllBtn.type = 'button';
    replyAllBtn.className = 'bm-action-pill bm-reply-all-btn';
    replyAllBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M7 8V5l-7 7 7 7v-3l-4-4 4-4zm6 1V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z"/></svg> <span>Reply all</span>';
    replyAllBtn.onclick = function (e) {
      e.preventDefault();
      var rc = getRcmail();
      if (rc) rc.command('reply-all', '', this, e);
    };

    // Forward Button
    var forwardBtn = document.createElement('button');
    forwardBtn.type = 'button';
    forwardBtn.className = 'bm-action-pill bm-forward-btn';
    forwardBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M14 9V5l7 7-7 7v-4.1c-5 0-8.5 1.6-11 5.1 1-5 4-10 11-11z"/></svg> <span>Forward</span>';
    forwardBtn.onclick = function (e) {
      e.preventDefault();
      var rc = getRcmail();
      if (rc) rc.command('forward', '', this, e);
    };

    pillBox.appendChild(replyBtn);
    pillBox.appendChild(replyAllBtn);
    pillBox.appendChild(forwardBtn);

    container.appendChild(pillBox);
  }

  // 2. Gmail-Style ••• Trimmed Content Toggle for Quoted Messages
  function initTrimmedContentToggle() {
    var editor = document.querySelector('#composebody') || document.querySelector('textarea[name="_message"]');
    var quotes = document.querySelectorAll('blockquote, .quoted-text, div.gmail_quote, div.roundcube_quote');

    quotes.forEach(function (quote) {
      if (quote.getAttribute('data-bm-trimmed') === 'true') return;
      quote.setAttribute('data-bm-trimmed', 'true');
      quote.classList.add('bm-trimmed-content', 'is-collapsed');

      var toggle = document.createElement('div');
      toggle.className = 'bm-trimmed-toggle';
      toggle.title = 'Show trimmed content';
      toggle.innerText = '•••';

      toggle.onclick = function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (quote.classList.contains('is-collapsed')) {
          quote.classList.remove('is-collapsed');
          toggle.style.display = 'none';
        }
      };

      if (quote.parentNode) {
        quote.parentNode.insertBefore(toggle, quote);
      }
    });

    // Also check TinyMCE HTML Editor if present
    if (window.tinymce && window.tinymce.activeEditor) {
      try {
        var doc = window.tinymce.activeEditor.getDoc();
        if (doc) {
          var iframeQuotes = doc.querySelectorAll('blockquote, .quoted-text, div.gmail_quote');
          iframeQuotes.forEach(function (iq) {
            if (iq.getAttribute('data-bm-trimmed') === 'true') return;
            iq.setAttribute('data-bm-trimmed', 'true');
            iq.style.display = 'none';

            var tBtn = doc.createElement('button');
            tBtn.type = 'button';
            tBtn.innerText = '•••';
            tBtn.style.cssText = 'background:#e8eaed; border:1px solid #dadce0; border-radius:10px; color:#5f6368; font-weight:bold; cursor:pointer; padding:2px 8px; margin:10px 0; display:inline-block;';
            tBtn.onclick = function () {
              iq.style.display = '';
              tBtn.style.display = 'none';
            };
            iq.parentNode.insertBefore(tBtn, iq);
          });
        }
      } catch (err) {}
    }
  }

  // 3. Ctrl+Enter / Cmd+Enter Send Keyboard Shortcut
  function setupSendShortcut() {
    function handleKeyDown(e) {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'Enter' || e.keyCode === 13)) {
        var sendBtn = document.querySelector('button.btn-primary.send, button.send, a.button.send, .mainaction.send');
        var rc = getRcmail();

        if (sendBtn && !sendBtn.disabled) {
          e.preventDefault();
          sendBtn.click();
        } else if (rc) {
          e.preventDefault();
          rc.command('send', '', this, e);
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown, true);

    // If TinyMCE is used, attach keydown listener inside the iframe editor
    if (window.tinymce) {
      window.tinymce.on('AddEditor', function (e) {
        e.editor.on('init', function () {
          e.editor.on('keydown', handleKeyDown);
        });
      });
    }
  }

  // 4. Observe DOM updates for dynamic AJAX-driven view transitions
  function initObserver() {
    initActionPills();
    initTrimmedContentToggle();

    var observer = new MutationObserver(function () {
      initActionPills();
      initTrimmedContentToggle();
    });

    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true });
    }
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      setupSendShortcut();
      initObserver();
    });
  } else {
    setupSendShortcut();
    initObserver();
  }
})();
