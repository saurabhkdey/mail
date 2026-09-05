/**
 * BillionMail Modern Roundcube Theme Enhancements
 * Adds UI micro-interactions, dark mode synchronization, and smooth compose/reply workflow.
 */

(function () {
  'use strict';

  function initModernTheme() {
    // 1. Dark Mode Sync with OS
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');
    function syncTheme() {
      if (!document.body.classList.contains('dark-mode') && !document.body.classList.contains('light-mode')) {
        if (prefersDark && prefersDark.matches) {
          document.documentElement.setAttribute('data-theme', 'dark');
        } else {
          document.documentElement.setAttribute('data-theme', 'light');
        }
      }
    }
    syncTheme();
    if (prefersDark && prefersDark.addEventListener) {
      prefersDark.addEventListener('change', syncTheme);
    }

    // 2. Enhance Compose / Reply focus & shortcuts
    function enhanceCompose() {
      const composeBody = document.getElementById('composebody');
      if (composeBody) {
        // If top posting, ensure focus is at the top
        composeBody.focus();
      }

      // Format recipient fields
      const recipientInputs = document.querySelectorAll('input._recipient');
      recipientInputs.forEach(function (inp) {
        inp.setAttribute('spellcheck', 'false');
      });

      // Keyboard shortcut: Ctrl+Enter or Cmd+Enter to send
      document.addEventListener('keydown', function (e) {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
          const sendBtn = document.querySelector('.btn.send, .button.mainaction.send, a.button.send, button.send');
          if (sendBtn) {
            e.preventDefault();
            sendBtn.click();
          }
        }
      });
    }

    // 3. Smooth Collapsible Blockquotes for Replies
    function enhanceBlockquotes() {
      const quotes = document.querySelectorAll('blockquote:not(.bm-enhanced)');
      quotes.forEach(function (quote) {
        quote.classList.add('bm-enhanced');
        if (quote.scrollHeight > 160 && !quote.querySelector('.bm-quote-toggle')) {
          const wrapper = document.createElement('div');
          wrapper.className = 'bm-quote-container';
          quote.parentNode.insertBefore(wrapper, quote);
          wrapper.appendChild(quote);

          const toggle = document.createElement('button');
          toggle.type = 'button';
          toggle.className = 'rcmQuoteToggle bm-quote-toggle';
          toggle.innerHTML = '<span>•••</span> <small>Quoted text</small>';
          quote.style.display = 'none';

          toggle.addEventListener('click', function () {
            if (quote.style.display === 'none') {
              quote.style.display = 'block';
              toggle.classList.add('expanded');
            } else {
              quote.style.display = 'none';
              toggle.classList.remove('expanded');
            }
          });

          wrapper.insertBefore(toggle, quote);
        }
      });
    }

    // 4. Gmail-style Bottom Quick Action Buttons (Reply & Forward)
    function enhanceMessageView() {
      const container = document.querySelector('#messagepreview, #messagecontent, .message-content, .message-htmlpart');
      if (container && !document.querySelector('.bm-gmail-actions')) {
        const actionRow = document.createElement('div');
        actionRow.className = 'bm-gmail-actions';
        actionRow.innerHTML = 
          '<button type="button" class="bm-gmail-pill-btn bm-btn-reply">' +
            '<svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z"/></svg>' +
            '<span>Reply</span>' +
          '</button>' +
          '<button type="button" class="bm-gmail-pill-btn bm-btn-forward">' +
            '<svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M14 9V5l7 7-7 7v-4.1c-5 0-8.5 1.6-11 5.1 1-5 4-10 11-11z"/></svg>' +
            '<span>Forward</span>' +
          '</button>';

        actionRow.querySelector('.bm-btn-reply').addEventListener('click', function (e) {
          if (window.rcmail) {
            rcmail.command('reply', '', this, e);
          } else {
            const btn = document.querySelector('.btn.reply, .button.reply, a.reply');
            if (btn) btn.click();
          }
        });

        actionRow.querySelector('.bm-btn-forward').addEventListener('click', function (e) {
          if (window.rcmail) {
            rcmail.command('forward', '', this, e);
          } else {
            const btn = document.querySelector('.btn.forward, .button.forward, a.forward');
            if (btn) btn.click();
          }
        });

        container.appendChild(actionRow);
      }
    }

    // Run on initial load and whenever DOM updates
    enhanceCompose();
    enhanceBlockquotes();
    enhanceMessageView();

    // Observe dynamic changes (e.g. AJAX page changes, message loading)
    const observer = new MutationObserver(function () {
      enhanceBlockquotes();
      enhanceMessageView();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initModernTheme);
  } else {
    initModernTheme();
  }
})();
