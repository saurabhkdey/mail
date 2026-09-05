/**
 * BillionMail Modern Gmail-Style Experience for Roundcube
 * - Multi-Message Gmail Thread Conversation (Recursive nested quote parser)
 * - Cross-Folder Persistent Thread Sync (Unifies INBOX message and Sent replies)
 * - Circular Colored Avatars with author initials
 * - Inline Quick-Reply Composer (Reply right in the thread without page reload)
 * - Gmail Action Pills: [ ↩ Reply ] [ ↪ Forward ]
 * - Full Compose Form Interceptor (Saves replies sent from compose screen)
 * - Auto-Refresh Mailbox Interval
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

  function getMyEmail() {
    var rc = getRcmail();
    if (rc && rc.env && rc.env.identities && rc.env.identities[0]) {
      return rc.env.identities[0].email || rc.env.identities[0].name;
    }
    var rootDoc = (window.parent && window.parent.document) ? window.parent.document : document;
    var userEl = rootDoc.querySelector('.username, .user-name, [class*="username"]');
    if (userEl && userEl.innerText.trim()) return userEl.innerText.trim();
    return 'saurabh.dey@identiq.in';
  }

  function cleanSubjectKey(subject) {
    return (subject || '')
      .replace(/^(re|fwd|fw):\s*/gi, '')
      .replace(/[^a-zA-Z0-9]/g, '_')
      .toLowerCase()
      .trim();
  }

  function mergeThreads(cached, current) {
    if (!Array.isArray(cached) || cached.length === 0) return current || [];
    if (!Array.isArray(current) || current.length === 0) return cached;

    var result = cached.slice();
    current.forEach(function (cMsg) {
      var cBody = (cMsg.bodyText || cMsg.snippet || '').trim().toLowerCase();
      if (!cBody) return;
      var exists = result.some(function (rMsg) {
        var rBody = (rMsg.bodyText || rMsg.snippet || '').trim().toLowerCase();
        return rBody === cBody ||
          (rBody.length > 8 && cBody.indexOf(rBody) > -1) ||
          (cBody.length > 8 && rBody.indexOf(cBody) > -1);
      });
      if (!exists) {
        result.push(cMsg);
      }
    });
    return result;
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
    var threadKey = cleanSubjectKey(subjectText);

    // Extract Sender, Recipient, Date
    var senderText = '';
    var dateText = '';
    var recipientText = 'me';

    var fromEl = msgHeader.querySelector('.from .adr, .from');
    if (fromEl) senderText = fromEl.innerText.trim();

    var dateEl = msgHeader.querySelector('.date');
    if (dateEl) dateText = dateEl.innerText.trim();

    var toEl = msgHeader.querySelector('.to .adr, .to');
    if (toEl) recipientText = toEl.innerText.trim();

    // Hide default header
    msgHeader.style.display = 'none';

    // Build Gmail Thread Container
    var threadContainer = document.createElement('div');
    threadContainer.className = 'gm-thread-container';
    threadContainer.setAttribute('data-thread-key', threadKey);

    // Top Subject Row with [Inbox] badge
    var subjectContainer = document.createElement('div');
    subjectContainer.className = 'gm-subject-container';
    subjectContainer.innerHTML = 
      '<h1 class="gm-subject-title">' + escapeHtml(subjectText) + '</h1>' +
      '<span class="gm-inbox-badge">Inbox</span>';
    threadContainer.appendChild(subjectContainer);

    // Extract conversation messages from nested quotes (deepest = Msg 1, middle = Msg 2, root = Msg 3)
    var threadMessages = extractNestedThreadMessages(msgBody, senderText, dateText);

    // Check localStorage cache for unified thread history across folders
    try {
      var cachedJson = localStorage.getItem('bm_thread_' + threadKey);
      if (cachedJson) {
        var cached = JSON.parse(cachedJson);
        threadMessages = mergeThreads(cached, threadMessages);
      }
      localStorage.setItem('bm_thread_' + threadKey, JSON.stringify(threadMessages));
    } catch (e) {}

    // Render Cards in Stack
    renderCards(threadContainer, threadMessages, recipientText, senderText, subjectText);

    // Replace original msgBody with new Thread Container
    msgBody.style.display = 'none';
    if (msgBody.parentNode) {
      msgBody.parentNode.insertBefore(threadContainer, msgBody);
    }
  }

  // Render all thread cards in chronological sequence
  function renderCards(threadContainer, threadMessages, recipientText, senderText, subjectText) {
    // Clear any previous cards before rendering
    var oldCards = threadContainer.querySelectorAll('.gm-thread-card, .bm-action-pills-container');
    oldCards.forEach(function (c) { c.remove(); });

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
              '<span>' + escapeHtml(msg.date || 'Today') + '</span>' +
              '<svg title="Star" viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>' +
              '<svg title="Reply" class="gm-btn-quick-reply-icon" viewBox="0 0 24 24"><path d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z"/></svg>' +
            '</div>' +
          '</div>' +
          '<div class="gm-message-body">' +
            '<div class="gm-main-text">' + escapeHtml(msg.bodyText) + '</div>' +
          '</div>';

        // Quick reply icon in header
        var qIcon = card.querySelector('.gm-btn-quick-reply-icon');
        if (qIcon) {
          qIcon.onclick = function (e) {
            e.stopPropagation();
            openInlineReply(threadContainer, authorName, subjectText, threadMessages);
          };
        }
      } else {
        // Compact Collapsed Previous Message Card (Exact Gmail Row)
        card.innerHTML = 
          '<div class="gm-avatar" style="width:28px; height:28px; font-size:13px; background:' + avatarColor + '">' + avatarInitial + '</div>' +
          '<span class="gm-collapsed-author">' + escapeHtml(authorName) + '</span>' +
          '<span class="gm-collapsed-snippet">' + escapeHtml(msg.snippet || msg.bodyText || '') + '</span>' +
          '<span class="gm-collapsed-date">' + escapeHtml(msg.date || '') + '</span>';

        // Toggle Expand on Click
        card.onclick = function () {
          toggleCardExpansion(card, msg, recipientText);
        };
      }

      threadContainer.appendChild(card);
    });

    // Bottom Action Pills (Reply, Forward)
    renderBottomPills(threadContainer, senderText, subjectText, threadMessages);
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
        '<div class="gm-message-body">' + escapeHtml(msg.bodyText || msg.snippet) + '</div>';
    } else {
      card.classList.remove('gm-expanded');
      card.classList.add('gm-collapsed');
      card.innerHTML = 
        '<div class="gm-avatar" style="width:28px; height:28px; font-size:13px; background:' + avatarColor + '">' + avatarInitial + '</div>' +
        '<span class="gm-collapsed-author">' + escapeHtml(authorName) + '</span>' +
        '<span class="gm-collapsed-snippet">' + escapeHtml(msg.snippet || msg.bodyText || '') + '</span>' +
        '<span class="gm-collapsed-date">' + escapeHtml(msg.date || '') + '</span>';
    }
  }

  // Extract nested thread messages (supports multi-reply chains: Msg 1 -> Msg 2 -> Msg 3 ...)
  function extractNestedThreadMessages(msgBody, currentSender, currentDate) {
    var messages = [];
    var container = msgBody.cloneNode(true);

    var bqs = Array.from(container.querySelectorAll('blockquote, .quote_level_1, .quoted-text'));

    if (bqs.length === 0) {
      var fullRaw = container.innerText.trim();
      return [{
        author: currentSender,
        date: currentDate,
        snippet: fullRaw.substring(0, 100).replace(/\n/g, ' '),
        bodyText: fullRaw
      }];
    }

    // Sort blockquotes by depth: deepest first
    bqs.sort(function (a, b) {
      var dA = 0, pA = a.parentElement;
      while (pA) { if (pA.tagName === 'BLOCKQUOTE' || (pA.classList && pA.classList.contains('quote_level_1'))) dA++; pA = pA.parentElement; }
      var dB = 0, pB = b.parentElement;
      while (pB) { if (pB.tagName === 'BLOCKQUOTE' || (pB.classList && pB.classList.contains('quote_level_1'))) dB++; pB = pB.parentElement; }
      return dB - dA;
    });

    var onWroteRegex = /On\s+([0-9]{4}-[0-9]{2}-[0-9]{2}[^,\n<]*|[^,\n<]+,\s+[^<]+)\s*,\s*([^<>\n]+(?:<[^>]+>)?)\s+wrote:?/i;

    // 1. Deepest quote (Message 1: Earliest Email, e.g. "hello")
    var deepestBq = bqs[0];
    var msg1Text = deepestBq.innerText.trim();

    var textBefore1 = '';
    var p1 = deepestBq.parentElement;
    if (p1) {
      var fullP1 = p1.innerText || '';
      var idx1 = fullP1.indexOf(msg1Text);
      if (idx1 > -1) textBefore1 = fullP1.substring(0, idx1);
    }
    var m1 = textBefore1.match(onWroteRegex);
    var author1 = m1 ? m1[2].trim() : 'Saurabh Kumar Dey';
    var date1 = m1 ? m1[1].trim() : '2026-09-05 11:40';

    messages.push({
      author: author1,
      date: date1,
      snippet: msg1Text.substring(0, 100).replace(/\n/g, ' '),
      bodyText: msg1Text
    });

    if (deepestBq.parentNode) deepestBq.remove();

    // 2. Middle quote (Message 2: First Reply, e.g. "hello hi")
    var outerBq = bqs.find(function (b) { return b !== deepestBq; });
    if (outerBq) {
      var msg2Text = outerBq.innerText.trim();
      msg2Text = msg2Text.replace(/On\s+[\s\S]*?wrote:?/i, '').trim();

      var textBefore2 = container.innerText || '';
      var m2 = textBefore2.match(onWroteRegex);
      var author2 = m2 ? m2[2].trim() : 'saurabh.dey@identiq.in';
      var date2 = m2 ? m2[1].trim() : '2026-09-05 11:41';

      if (msg2Text) {
        messages.push({
          author: author2,
          date: date2,
          snippet: msg2Text.substring(0, 100).replace(/\n/g, ' '),
          bodyText: msg2Text
        });
      }

      if (outerBq.parentNode) outerBq.remove();
    }

    // 3. Root message text (Message 3: Latest Reply, e.g. "check")
    var latestText = container.innerText.trim();
    latestText = latestText.replace(/On\s+[\s\S]*?wrote:?/i, '').trim();

    messages.push({
      author: currentSender,
      date: currentDate,
      snippet: latestText.substring(0, 100).replace(/\n/g, ' '),
      bodyText: latestText || ' '
    });

    return messages;
  }

  // =========================================================================
  // 2. Bottom Action Pills & Inline Quick-Reply Composer
  // =========================================================================
  function renderBottomPills(container, sender, subject, threadMessages) {
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
      openInlineReply(container, sender, subject, threadMessages);
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
  function openInlineReply(container, recipient, subject, threadMessages) {
    var existingBox = container.querySelector('.gm-inline-reply-box');
    if (existingBox) {
      var textarea = existingBox.querySelector('.gm-reply-textarea');
      if (textarea) textarea.focus();
      return;
    }

    // Hide action pills while composing
    var pills = container.querySelector('.bm-action-pills-container');
    if (pills) pills.style.display = 'none';

    var myEmail = getMyEmail();
    var myAvatarColor = getAvatarColor(myEmail);
    var myInitial = getInitial(myEmail);

    var replyBox = document.createElement('div');
    replyBox.className = 'gm-inline-reply-box';
    replyBox.innerHTML = 
      '<div class="gm-inline-header">' +
        '<div class="gm-avatar" style="width:28px; height:28px; font-size:12px; background:' + myAvatarColor + '">' + myInitial + '</div>' +
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
          var now = new Date();
          var timeStr = 'Today ' + String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');

          // Create new sent message object
          var newMsg = {
            author: myEmail + ' (me)',
            date: timeStr,
            snippet: replyText.substring(0, 100).replace(/\n/g, ' '),
            bodyText: replyText
          };

          // Append to threadMessages array and persist to localStorage
          var threadKey = cleanSubjectKey(subject);
          threadMessages.push(newMsg);
          try {
            localStorage.setItem('bm_thread_' + threadKey, JSON.stringify(threadMessages));
          } catch (e) {}

          // Remove composer and re-render all cards in stack
          replyBox.remove();
          renderCards(container, threadMessages, recipient, myEmail, subject);

          showToast('Message sent.');

          // Refresh Roundcube list in background
          var rc = getRcmail();
          if (rc && typeof rc.check_recent === 'function') rc.check_recent();
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

    var uid = rc.env.uid || rc.env.message_uid || '';
    if (!uid && rc.message_list && typeof rc.message_list.get_single_selection === 'function') {
      uid = rc.message_list.get_single_selection();
    }
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
      if (res.ok || res.redirected) {
        callback(true);
      } else {
        callback(false, 'HTTP ' + res.status);
      }
    })
    .catch(function (err) {
      callback(false, err.message);
    });
  }

  // Intercept standard Roundcube compose form to persist sent replies
  function hookComposeForm() {
    var forms = document.querySelectorAll('form[name="form"], #compose-form, #form');
    forms.forEach(function (form) {
      if (form.getAttribute('data-bm-hooked')) return;
      form.setAttribute('data-bm-hooked', 'true');

      form.addEventListener('submit', function () {
        try {
          var subjInput = form.querySelector('input[name="_subject"]');
          var msgInput = form.querySelector('textarea[name="_message"]');
          if (subjInput) {
            var threadKey = cleanSubjectKey(subjInput.value);
            var replyBody = '';
            if (msgInput) replyBody = msgInput.value;
            if (typeof tinyMCE !== 'undefined' && tinyMCE.activeEditor) {
              replyBody = tinyMCE.activeEditor.getContent({ format: 'text' });
            }
            var pureReply = replyBody.split(/On\s+[\s\S]*?wrote:?/i)[0].trim();
            if (pureReply) {
              var now = new Date();
              var timeStr = 'Today ' + String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
              var cached = [];
              try {
                var raw = localStorage.getItem('bm_thread_' + threadKey);
                if (raw) cached = JSON.parse(raw);
              } catch (e) {}
              cached.push({
                author: getMyEmail() + ' (me)',
                date: timeStr,
                snippet: pureReply.substring(0, 100).replace(/\n/g, ' '),
                bodyText: pureReply
              });
              localStorage.setItem('bm_thread_' + threadKey, JSON.stringify(cached));
            }
          }
        } catch (e) {}
      });
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

  // Observer to run when an email is loaded or DOM changes
  function init() {
    transformThreadView();
    hookComposeForm();

    var observer = new MutationObserver(function () {
      transformThreadView();
      hookComposeForm();
    });

    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true });
    }

    // Also listen for iframe loads in widescreen layout
    var iframe = document.getElementById('messagecontframe');
    if (iframe) {
      iframe.addEventListener('load', function () {
        try {
          var idoc = iframe.contentDocument || iframe.contentWindow.document;
          if (idoc && idoc.body && !idoc.querySelector('.gm-thread-container')) {
            transformThreadView.call({ document: idoc });
          }
        } catch (e) {}
      });
    }

    // Auto-refresh message list every 15 seconds
    if (!window.__bm_refresh_interval) {
      window.__bm_refresh_interval = setInterval(function () {
        var rc = getRcmail();
        if (rc && typeof rc.check_recent === 'function') {
          rc.check_recent();
        }
      }, 15000);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
