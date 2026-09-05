/**
 * BillionMail Modern Gmail-Style Experience for Roundcube
 * - Gmail Thread Conversation View (Stacked collapsible cards)
 * - Colored Circle Avatars with author initials
 * - Inline Quick-Reply Composer (Reply right in the thread without page reload)
 * - Gmail Action Pills: [ ↩ Reply ] [ ↪ Forward ]
 * - ••• Trimmed Quote Toggle
 * - Ctrl+Enter / Cmd+Enter Send Shortcut
 */

(function () {
  'use strict';

  var AVATAR_COLORS = [
    '#7b1fa2', '#1a73e8', '#0f9d58', '#d93025',
    '#f4511e', '#00897b', '#3949ab', '#00acc1',
    '#8e24aa', '#e53935', '#43a047', '#fb8c00'
  ];

  function getAvatarColor(str) {
    if (!str) return '#1a73e8';
    var hash = 0;
    for (var i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    var index = Math.abs(hash % AVATAR_COLORS.length);
    return AVATAR_COLORS[index];
  }

  function getInitial(str) {
    if (!str) return 'U';
    var clean = str.replace(/<.*?>/g, '').replace(/["']/g, '').trim();
    return clean ? clean.charAt(0).toUpperCase() : 'U';
  }

  function getRcmail() {
    if (typeof window.rcmail !== 'undefined') return window.rcmail;
    if (window.parent && typeof window.parent.rcmail !== 'undefined') return window.parent.rcmail;
    return null;
  }

  // =========================================================================
  // 1. Transform Reading Pane to Gmail-Style Thread Conversation View
  // =========================================================================
  function transformThreadView() {
    var msgHeader = document.querySelector('#message-header');
    var msgBody = document.querySelector('#messagebody');
    if (!msgHeader || !msgBody) return;
    if (document.querySelector('.gm-thread-container')) return; // Already transformed

    document.body.classList.add('gm-view-active');

    // Extract Subject
    var subjectEl = msgHeader.querySelector('.subject');
    var subjectText = subjectEl ? subjectEl.innerText.replace(/openinextwin/gi, '').trim() : 'No Subject';

    // Extract Sender & Recipient & Date from Roundcube Header
    var senderText = '';
    var dateText = '';
    var recipientText = 'me';

    var fromEl = msgHeader.querySelector('.from .adr, .from');
    if (fromEl) senderText = fromEl.innerText.trim();

    var dateEl = msgHeader.querySelector('.date');
    if (dateEl) dateText = dateEl.innerText.trim();

    var toEl = msgHeader.querySelector('.to .adr, .to');
    if (toEl) recipientText = toEl.innerText.trim();

    // Hide old messy header
    msgHeader.style.display = 'none';

    // Build Gmail Thread Container
    var threadContainer = document.createElement('div');
    threadContainer.className = 'gm-thread-container';

    // Top Subject Row with [Inbox] badge
    var subjectContainer = document.createElement('div');
    subjectContainer.className = 'gm-subject-container';
    subjectContainer.innerHTML = 
      '<h1 class="gm-subject-title">' + escapeHtml(subjectText) + '</h1>' +
      '<span class="gm-inbox-badge">Inbox</span>';
    threadContainer.appendChild(subjectContainer);

    // Parse Body for Thread Messages
    var rawHtml = msgBody.innerHTML;
    var rawText = msgBody.innerText || '';

    var threadMessages = parseEmailThread(rawText, rawHtml, senderText, dateText);

    // Render Cards in Stack
    threadMessages.forEach(function (msg, idx) {
      var isLatest = (idx === threadMessages.length - 1);
      var card = document.createElement('div');
      card.className = 'gm-thread-card ' + (isLatest ? 'gm-expanded' : 'gm-collapsed');
      card.setAttribute('data-msg-idx', idx);

      var authorName = msg.author || senderText || 'Unknown';
      var avatarInitial = getInitial(authorName);
      var avatarColor = getAvatarColor(authorName);

      if (isLatest) {
        // Expanded Latest Card (Active Email)
        card.innerHTML = 
          '<div class="gm-thread-header">' +
            '<div class="gm-author-meta">' +
              '<div class="gm-avatar" style="background:' + avatarColor + '">' + avatarInitial + '</div>' +
              '<div class="gm-author-names">' +
                '<span class="gm-author-name">' + escapeHtml(authorName) + '</span>' +
                '<span class="gm-recipient-chip">to ' + escapeHtml(recipientText) + ' ▾</span>' +
              '</div>' +
            '</div>' +
            '<div class="gm-header-right">' +
              '<span>' + escapeHtml(msg.date || dateText) + '</span>' +
              '<svg title="Star" viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>' +
              '<svg title="Reply" class="gm-btn-quick-reply-icon" viewBox="0 0 24 24"><path d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z"/></svg>' +
            '</div>' +
          '</div>' +
          '<div class="gm-message-body">' + msg.bodyHtml + '</div>';

        // Bind quick reply icon in header
        var qIcon = card.querySelector('.gm-btn-quick-reply-icon');
        if (qIcon) {
          qIcon.onclick = function (e) {
            e.stopPropagation();
            openInlineReply(threadContainer, authorName, subjectText);
          };
        }
      } else {
        // Compact Collapsed Previous Message Card (Exact Gmail Row)
        card.innerHTML = 
          '<div class="gm-avatar" style="width:28px; height:28px; font-size:13px; background:' + avatarColor + '">' + avatarInitial + '</div>' +
          '<span class="gm-collapsed-author">' + escapeHtml(authorName) + '</span>' +
          '<span class="gm-collapsed-snippet">' + escapeHtml(msg.snippet) + '</span>' +
          '<span class="gm-collapsed-date">' + escapeHtml(msg.date || '') + '</span>';

        // Toggle Expand on Click
        card.onclick = function () {
          toggleCardExpansion(card, msg, recipientText);
        };
      }

      threadContainer.appendChild(card);
    });

    // Replace original msgBody with new Thread Container
    msgBody.style.display = 'none';
    if (msgBody.parentNode) {
      msgBody.parentNode.insertBefore(threadContainer, msgBody);
    }

    // Bottom Action Pills (Reply, Forward)
    renderBottomPills(threadContainer, senderText, subjectText);
  }

  // Toggle card between collapsed and expanded
  function toggleCardExpansion(card, msg, recipientText) {
    var isCollapsed = card.classList.contains('gm-collapsed');
    var authorName = msg.author || 'Unknown';
    var avatarInitial = getInitial(authorName);
    var avatarColor = getAvatarColor(authorName);

    if (isCollapsed) {
      card.classList.remove('gm-collapsed');
      card.classList.add('gm-expanded');
      card.innerHTML = 
        '<div class="gm-thread-header">' +
          '<div class="gm-author-meta">' +
            '<div class="gm-avatar" style="background:' + avatarColor + '">' + avatarInitial + '</div>' +
            '<div class="gm-author-names">' +
              '<span class="gm-author-name">' + escapeHtml(authorName) + '</span>' +
              '<span class="gm-recipient-chip">to ' + escapeHtml(recipientText) + '</span>' +
            '</div>' +
          '</div>' +
          '<div class="gm-header-right">' +
            '<span>' + escapeHtml(msg.date || '') + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="gm-message-body">' + msg.bodyHtml + '</div>';
    } else {
      card.classList.remove('gm-expanded');
      card.classList.add('gm-collapsed');
      card.innerHTML = 
        '<div class="gm-avatar" style="width:28px; height:28px; font-size:13px; background:' + avatarColor + '">' + avatarInitial + '</div>' +
        '<span class="gm-collapsed-author">' + escapeHtml(authorName) + '</span>' +
        '<span class="gm-collapsed-snippet">' + escapeHtml(msg.snippet) + '</span>' +
        '<span class="gm-collapsed-date">' + escapeHtml(msg.date || '') + '</span>';
    }
  }

  // Parse email body into conversation thread items cleanly
  function parseEmailThread(text, html, currentSender, currentDate) {
    var messages = [];

    // Line by line classification
    var lines = text.split('\n');
    var prevLines = [];
    var newLines = [];
    var quoteAuthor = '';
    var quoteDate = '';

    var onWroteRegex = /On\s+([0-9]{4}-[0-9]{2}-[0-9]{2}[^,\n]*|[^,\n]+,\s+[^\n]+)\s*,\s*([^<>\n]+(?:<[^>]+>)?)\s+wrote:/i;

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var match = line.match(onWroteRegex);
      if (match) {
        quoteDate = match[1].trim();
        quoteAuthor = match[2].trim();
        continue;
      }

      // If line is quoted (starts with | or >)
      if (/^[\s|>]+/.test(line)) {
        var cleanQuoteLine = line.replace(/^[\s|>]+/, '').trimEnd();
        if (cleanQuoteLine) prevLines.push(cleanQuoteLine);
      } else if (line.trim().length > 0) {
        newLines.push(line.trim());
      }
    }

    var prevBody = prevLines.join('\n').trim();
    var newBody = newLines.join('\n').trim();

    if (prevBody && quoteAuthor) {
      // 1. Previous Message in Thread (Saurabh Kumar Dey)
      messages.push({
        author: quoteAuthor,
        date: quoteDate || 'Previous',
        snippet: prevBody.substring(0, 80) || 'Previous message',
        bodyHtml: escapeHtml(prevBody)
      });

      // 2. Latest Reply Message
      messages.push({
        author: currentSender,
        date: currentDate,
        snippet: newBody.substring(0, 80) || newBody,
        bodyHtml: escapeHtml(newBody)
      });
    } else {
      // Single email without quoted thread
      messages.push({
        author: currentSender,
        date: currentDate,
        snippet: text.substring(0, 80),
        bodyHtml: html || escapeHtml(text)
      });
    }

    return messages;
  }

  // =========================================================================
  // 2. Bottom Action Pills & Inline Quick-Reply Composer
  // =========================================================================
  function renderBottomPills(container, sender, subject) {
    if (container.querySelector('.bm-action-pills-container')) return;

    var pillBox = document.createElement('div');
    pillBox.className = 'bm-action-pills-container';

    // [ ↩ Reply ]
    var replyBtn = document.createElement('button');
    replyBtn.type = 'button';
    replyBtn.className = 'bm-action-pill';
    replyBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z"/></svg> <span>Reply</span>';
    replyBtn.onclick = function (e) {
      e.preventDefault();
      openInlineReply(container, sender, subject);
    };

    // [ ↪ Forward ]
    var forwardBtn = document.createElement('button');
    forwardBtn.type = 'button';
    forwardBtn.className = 'bm-action-pill';
    forwardBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M14 9V5l7 7-7 7v-4.1c-5 0-8.5 1.6-11 5.1 1-5 4-10 11-11z"/></svg> <span>Forward</span>';
    forwardBtn.onclick = function (e) {
      e.preventDefault();
      var rc = getRcmail();
      if (rc) rc.command('forward', '', this, e);
    };

    pillBox.appendChild(replyBtn);
    pillBox.appendChild(forwardBtn);

    container.appendChild(pillBox);
  }

  // Open Gmail Inline Quick Reply Box
  function openInlineReply(container, recipient, subject) {
    var existingBox = container.querySelector('.gm-inline-reply-box');
    if (existingBox) {
      var textarea = existingBox.querySelector('.gm-reply-textarea');
      if (textarea) textarea.focus();
      return;
    }

    // Hide action pills while composing
    var pills = container.querySelector('.bm-action-pills-container');
    if (pills) pills.style.display = 'none';

    var myAvatarColor = '#1a73e8';

    var replyBox = document.createElement('div');
    replyBox.className = 'gm-inline-reply-box';
    replyBox.innerHTML = 
      '<div class="gm-inline-header">' +
        '<div class="gm-avatar" style="width:28px; height:28px; font-size:12px; background:' + myAvatarColor + '">S</div>' +
        '<span class="gm-reply-label">↩ Reply</span>' +
        '<span class="gm-reply-to">' + escapeHtml(recipient || 'Recipient') + '</span>' +
        '<button type="button" class="gm-inline-popout" title="Pop-out to full editor">↗</button>' +
      '</div>' +
      '<textarea class="gm-reply-textarea" placeholder="Reply to ' + escapeHtml(recipient || '') + '..."></textarea>' +
      '<div class="gm-inline-footer">' +
        '<div class="gm-footer-left">' +
          '<button type="button" class="gm-send-pill-btn">' +
            '<svg viewBox="0 0 24 24" width="16" height="16" fill="white"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>' +
            '<span>Send</span>' +
          '</button>' +
          '<span style="font-size:11px; color:#80868b; margin-left:8px;">Ctrl+Enter</span>' +
        '</div>' +
        '<div class="gm-footer-right">' +
          '<button type="button" class="gm-discard-btn" title="Discard draft">' +
            '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>' +
          '</button>' +
        '</div>' +
      '</div>';

    container.appendChild(replyBox);

    var textarea = replyBox.querySelector('.gm-reply-textarea');
    textarea.focus();

    // Auto-expand textarea on typing
    textarea.addEventListener('input', function () {
      this.style.height = 'auto';
      this.style.height = (this.scrollHeight) + 'px';
    });

    // Popout to full editor
    replyBox.querySelector('.gm-inline-popout').onclick = function () {
      var rc = getRcmail();
      if (rc) rc.command('reply', '', this);
    };

    // Discard button
    replyBox.querySelector('.gm-discard-btn').onclick = function () {
      replyBox.remove();
      if (pills) pills.style.display = 'flex';
    };

    // Send Button Handler
    var sendBtn = replyBox.querySelector('.gm-send-pill-btn');
    var sendAction = function () {
      var replyText = textarea.value.trim();
      if (!replyText) return;

      sendBtn.disabled = true;
      sendBtn.innerHTML = '<span>Sending...</span>';

      sendInlineReply(replyText, recipient, subject, function (success, err) {
        if (success) {
          // Append new sent card directly to thread!
          var sentCard = document.createElement('div');
          sentCard.className = 'gm-thread-card gm-expanded';
          sentCard.innerHTML = 
            '<div class="gm-thread-header">' +
              '<div class="gm-author-meta">' +
                '<div class="gm-avatar" style="background:#1a73e8">S</div>' +
                '<div class="gm-author-names">' +
                  '<span class="gm-author-name">Saurabh Kumar Dey</span>' +
                  '<span class="gm-recipient-chip">to ' + escapeHtml(recipient) + '</span>' +
                '</div>' +
              '</div>' +
              '<div class="gm-header-right">' +
                '<span>Just now</span>' +
              '</div>' +
            '</div>' +
            '<div class="gm-message-body">' + escapeHtml(replyText) + '</div>';

          container.insertBefore(sentCard, replyBox);

          replyBox.remove();
          if (pills) pills.style.display = 'flex';

          showToast('Message sent.');
        } else {
          sendBtn.disabled = false;
          sendBtn.innerHTML = '<span>Send</span>';
          alert('Failed to send reply: ' + (err || 'Unknown error'));
        }
      });
    };

    sendBtn.onclick = sendAction;

    // Ctrl+Enter Send
    textarea.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'Enter' || e.keyCode === 13)) {
        e.preventDefault();
        sendAction();
      }
    });
  }

  // Send reply using Roundcube's compose session
  function sendInlineReply(text, recipient, subject, callback) {
    var rc = getRcmail();
    if (!rc || !rc.env) {
      return callback(false, 'Roundcube session not found');
    }

    var uid = rc.env.uid || '';
    var mbox = rc.env.mailbox || 'INBOX';

    // Request compose parameters first to obtain valid compose session & token
    fetch('/roundcube/?_task=mail&_action=compose&_reply_uid=' + uid + '&_mbox=' + encodeURIComponent(mbox), {
      credentials: 'same-origin'
    })
    .then(function (res) { return res.text(); })
    .then(function (html) {
      var parser = new DOMParser();
      var doc = parser.parseFromString(html, 'text/html');

      var form = doc.querySelector('form[name="form"]') || doc.querySelector('#compose-form');
      var fd = new FormData();

      if (form) {
        var inputs = form.querySelectorAll('input, select, textarea');
        inputs.forEach(function (inp) {
          if (inp.name) fd.append(inp.name, inp.value);
        });
      }

      // Override message text with the user's typed reply
      var existingMsg = fd.get('_message') || '';
      fd.set('_message', text + '\n\n' + existingMsg);
      fd.set('_is_html', '0');
      fd.set('_action', 'send');

      // Submit send POST
      return fetch('/roundcube/?_task=mail&_action=send', {
        method: 'POST',
        body: fd,
        credentials: 'same-origin'
      });
    })
    .then(function (res) {
      if (res.ok) {
        callback(true);
      } else {
        callback(false, 'HTTP ' + res.status);
      }
    })
    .catch(function (err) {
      callback(false, err.message);
    });
  }

  // Toast notification
  function showToast(msg) {
    var toast = document.createElement('div');
    toast.className = 'gm-toast';
    toast.innerText = msg;
    document.body.appendChild(toast);
    setTimeout(function () {
      toast.remove();
    }, 4000);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Observer to run when an email is loaded
  function init() {
    transformThreadView();

    var observer = new MutationObserver(function () {
      transformThreadView();
    });

    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
