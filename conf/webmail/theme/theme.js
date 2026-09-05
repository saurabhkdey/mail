/**
 * BillionMail Modern Gmail-Style Experience for Roundcube
 * - Multi-Message Gmail Thread Conversation (Recursive nested quote & text parser)
 * - Strict Chronological Sorting (Earliest top -> Latest bottom)
 * - Cross-Folder Persistent Thread Sync (Unifies INBOX message and Sent replies)
 * - Circular Colored Avatars with Google-Style Sender Profile Hovercards
 * - Visual Attachment Chips & Previews in Thread Cards
 * - Inline Quick-Reply Composer with File Attachments (Drag & Drop, Multi-file)
 * - Multi-Recipient "Reply All" Action Pill
 * - Automatic Signature Insertion in replies
 * - Gmail Power-User Single-Key Shortcuts (r, a, f, j, k, e, #, /, Esc)
 * - Compose Form Interceptor & Background Auto-Refresh
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

  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    var k = 1024;
    var sizes = ['B', 'KB', 'MB', 'GB'];
    var i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function getRcmail() {
    if (typeof window.rcmail !== 'undefined') return window.rcmail;
    if (window.parent && typeof window.parent.rcmail !== 'undefined') return window.parent.rcmail;
    return null;
  }

  function getMyName() {
    var rc = getRcmail();
    if (rc && rc.env && rc.env.identities && rc.env.identities[0]) {
      if (rc.env.identities[0].name) return rc.env.identities[0].name;
    }
    return 'Saurabh Kumar Dey';
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

  function getMySignature() {
    var rc = getRcmail();
    if (rc && rc.env && rc.env.identities && rc.env.identities[0]) {
      var id = rc.env.identities[0];
      return id.signature || id.html_signature || '';
    }
    return '';
  }

  function cleanSubjectKey(subject) {
    return (subject || '')
      .replace(/^(re|fwd|fw):\s*/gi, '')
      .replace(/[^a-zA-Z0-9]/g, '_')
      .toLowerCase()
      .trim();
  }

  // Parse any date/time string into numeric timestamp for strict chronological sorting
  function parseTimestamp(dateStr) {
    if (!dateStr) return 0;
    var str = String(dateStr).trim();

    var parsed = Date.parse(str);
    if (!isNaN(parsed) && !str.toLowerCase().includes('today') && !str.toLowerCase().includes('just now')) {
      return parsed;
    }

    var timeMatch = str.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?/i);
    var hours = 0, mins = 0;
    if (timeMatch) {
      hours = parseInt(timeMatch[1], 10);
      mins = parseInt(timeMatch[2], 10);
      if (timeMatch[4]) {
        var ampm = timeMatch[4].toLowerCase();
        if (ampm === 'pm' && hours < 12) hours += 12;
        if (ampm === 'am' && hours === 12) hours = 0;
      }
    }

    var dateMatch = str.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (dateMatch) {
      return new Date(parseInt(dateMatch[1], 10), parseInt(dateMatch[2], 10) - 1, parseInt(dateMatch[3], 10), hours, mins).getTime();
    }

    if (str.toLowerCase().includes('just now')) {
      return Date.now() + 10000;
    }

    var today = new Date();
    today.setHours(hours, mins, 0, 0);
    return today.getTime();
  }

  function sortChronological(a, b) {
    return parseTimestamp(a.date) - parseTimestamp(b.date);
  }


  // Extract real attachments from original message DOM
  function extractOriginalAttachments(doc) {
    var list = [];
    if (!doc) return list;

    // Only target actual message attachments, ignoring action menus or popup buttons
    var container = doc.querySelector('#message-header #attachment-list, #attachment-list.attachmentslist, .message-attachments #attachment-list, #messageattachments #attachment-list');
    if (!container) return list;

    var items = container.querySelectorAll('li');
    items.forEach(function (li) {
      if (li.closest('.popupmenu') || li.closest('#attachmentmenu') || li.classList.contains('menu')) return;

      var nameEl = li.querySelector('.attachment-name, .filename, a');
      if (!nameEl) return;

      var a = li.querySelector('a');
      var href = a ? (a.getAttribute('href') || '') : '';
      var name = nameEl.innerText.trim();

      // Clean out size text from name if it was grouped
      var sizeText = '';
      var sizeEl = li.querySelector('.attachment-size, .size');
      if (sizeEl) {
        sizeText = sizeEl.innerText.replace(/[()]/g, '').trim();
        name = name.replace(sizeEl.innerText, '').trim();
      }

      // Ignore false positives from action buttons (like "Open", "Download", "Save")
      var lower = name.toLowerCase();
      if (!name || lower === 'open' || lower === 'download' || lower === 'save' || lower === 'close') {
        return;
      }

      var ext = name.split('.').pop().toLowerCase();
      var type = 'file';
      if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].indexOf(ext) > -1) type = 'img';
      else if (ext === 'pdf') type = 'pdf';
      else if (['zip', 'tar', 'gz', 'rar', '7z'].indexOf(ext) > -1) type = 'zip';
      else if (['doc', 'docx', 'txt', 'rtf', 'odt', 'csv', 'xlsx', 'xls'].indexOf(ext) > -1) type = 'doc';

      list.push({ name: name, href: href, size: sizeText, type: type });
    });
    return list;
  }

  // Parse addresses from DOM elements or raw strings: returns { name, email, full }
  function parseAddress(el, fallbackText) {
    if (!el && !fallbackText) {
      return { name: '', email: '', full: '' };
    }

    if (el) {
      // Strictly target actual contact link elements and ignore "Add to address book" buttons
      var contactLinks = Array.from(el.querySelectorAll('a.rcmContactAddress, .adr a:not(.rcmAddContact):not([href^="#"])'));
      if (contactLinks.length === 0) {
        contactLinks = Array.from(el.querySelectorAll('.adr, a[title]')).filter(function (node) {
          var t = ((node.getAttribute('title') || '') + ' ' + (node.className || '') + ' ' + (node.innerText || '')).toLowerCase();
          return t.indexOf('add to address') === -1 && t.indexOf('rcmaddcontact') === -1;
        });
      }

      if (contactLinks.length > 0) {
        var names = [];
        var emails = [];
        var fullList = [];
        var seenKeys = {};

        contactLinks.forEach(function (a) {
          var em = a.getAttribute('title') || '';
          var nm = (a.innerText || a.textContent || '').trim();

          // Clean out any "Add to address book" text
          nm = nm.replace(/add\s+to\s+address\s+book/gi, '').trim();
          if (em.toLowerCase().indexOf('add to address') > -1) em = '';

          if (!em || em.indexOf('@') === -1) {
            var href = a.getAttribute('href') || '';
            var m = href.match(/mailto:([^?&]+)/i) || href.match(/_to=([^&]+)/i);
            if (m) em = decodeURIComponent(m[1]);
          }

          var emMatch = nm.match(/<([^>]+@[^>]+)>/);
          if (emMatch) {
            em = emMatch[1].trim();
            nm = nm.replace(/<[^>]+>/, '').trim();
          } else if (!em && nm.indexOf('@') > -1) {
            em = nm;
          }

          if (!nm && em) nm = em;
          if (!em && nm && nm.indexOf('@') > -1) em = nm;

          var dedupeKey = (em || nm).toLowerCase().trim();
          if (!dedupeKey || seenKeys[dedupeKey]) return;
          seenKeys[dedupeKey] = true;

          if (nm && em && nm !== em) {
            fullList.push(nm + ' <' + em + '>');
          } else {
            fullList.push(em || nm);
          }
          if (nm) names.push(nm);
          if (em) emails.push(em);
        });

        if (names.length > 0 || emails.length > 0) {
          return {
            name: names.join(', ') || fallbackText || '',
            email: emails.join(', ') || '',
            full: fullList.join(', ') || fallbackText || ''
          };
        }
      }
    }

    var text = (el ? (el.innerText || el.textContent || '') : (fallbackText || '')).trim();
    text = text.replace(/add\s+to\s+address\s+book/gi, '').trim();
    var emSingle = '';
    var nmSingle = text;
    var emMatchSingle = text.match(/<([^>]+@[^>]+)>/);
    if (emMatchSingle) {
      emSingle = emMatchSingle[1].trim();
      nmSingle = text.replace(/<[^>]+>/, '').trim();
    } else if (text.indexOf('@') > -1) {
      emSingle = text;
    }
    return {
      name: nmSingle || emSingle,
      email: emSingle,
      full: (nmSingle && emSingle && nmSingle !== emSingle) ? (nmSingle + ' <' + emSingle + '>') : (emSingle || nmSingle)
    };
  }

  // Extract full email headers for details popover
  function extractFullMessageMeta(msgHeader, fallbackSubject, fallbackSender, fallbackDate) {
    var meta = {
      subject: fallbackSubject || '',
      date: fallbackDate || '',
      from: { name: fallbackSender || '', email: '', full: fallbackSender || '' },
      to: { name: 'me', email: '', full: 'me' },
      cc: { name: '', email: '', full: '' },
      bcc: { name: '', email: '', full: '' },
      mailedBy: '',
      signedBy: '',
      security: 'Standard encryption (TLS)'
    };

    if (!msgHeader) return meta;

    var subjEl = msgHeader.querySelector('.subject');
    if (subjEl) meta.subject = subjEl.innerText.replace(/openinextwin/gi, '').trim();

    var dateEl = msgHeader.querySelector('.date');
    if (dateEl) meta.date = dateEl.innerText.trim();

    var fromEl = msgHeader.querySelector('.from');
    if (fromEl) meta.from = parseAddress(fromEl, fallbackSender);

    var toEl = msgHeader.querySelector('.to');
    if (toEl) meta.to = parseAddress(toEl, 'me');

    var ccEl = msgHeader.querySelector('.cc');
    if (ccEl) meta.cc = parseAddress(ccEl, '');

    var bccEl = msgHeader.querySelector('.bcc');
    if (bccEl) meta.bcc = parseAddress(bccEl, '');

    var domain = '';
    if (meta.from && meta.from.email && meta.from.email.indexOf('@') > -1) {
      domain = meta.from.email.split('@')[1];
    } else if (window.location && window.location.hostname) {
      domain = window.location.hostname.replace(/^mail\./i, '');
    }
    meta.mailedBy = domain;
    meta.signedBy = domain;

    return meta;
  }

  // =========================================================================
  // 1. Transform Reading Pane to Gmail-Style Thread Conversation View
  // =========================================================================
  function transformThreadView() {
    var doc = (this && this.document) ? this.document : document;
    var msgHeader = doc.querySelector('#message-header');
    var msgBody = doc.querySelector('#messagebody');
    if (!msgHeader || !msgBody) return;
    if (doc.querySelector('.gm-thread-container')) return; // Already transformed

    doc.body.classList.add('gm-view-active');

    // Extract Subject
    var subjectEl = msgHeader.querySelector('.subject');
    var subjectText = subjectEl ? subjectEl.innerText.replace(/openinextwin/gi, '').trim() : 'No Subject';
    var threadKey = cleanSubjectKey(subjectText);

    // Extract Sender, Recipient, Date
    var senderText = '';
    var dateText = '';
    var fromEl = msgHeader.querySelector('.from .adr, .from');
    if (fromEl) senderText = fromEl.innerText.trim();
    var dateEl = msgHeader.querySelector('.date');
    if (dateEl) dateText = dateEl.innerText.trim();

    // Extract Full Message Meta
    var meta = extractFullMessageMeta(msgHeader, subjectText, senderText, dateText);

    // Check if multiple recipients exist
    var hasCc = !!(meta.cc && meta.cc.full) || !!(meta.bcc && meta.bcc.full);
    var isMultiRecipient = hasCc || (meta.to.full.indexOf(',') > -1) || (meta.to.full.indexOf(';') > -1);

    // Extract attachments from original message
    var attachments = extractOriginalAttachments(doc);

    // Hide default header
    msgHeader.style.display = 'none';

    // Build Gmail Thread Container
    var threadContainer = doc.createElement('div');
    threadContainer.className = 'gm-thread-container';
    threadContainer.setAttribute('data-thread-key', threadKey);

    // Top Subject Row with [Inbox] badge
    var subjectContainer = doc.createElement('div');
    subjectContainer.className = 'gm-subject-container';
    subjectContainer.innerHTML = 
      '<h1 class="gm-subject-title">' + escapeHtml(meta.subject) + '</h1>' +
      '<span class="gm-inbox-badge">Inbox</span>';
    threadContainer.appendChild(subjectContainer);

    // Extract conversation messages from nested quotes & text
    var threadMessages = extractAllThreadMessages(msgBody, meta.from.name || senderText, meta.date || dateText);

    // Sort strictly chronological: Card 1 (oldest top) -> Card N (latest bottom)
    threadMessages.sort(sortChronological);

    // Render Cards in Stack (Fully expanded, no collapsed cards)
    renderCards(threadContainer, threadMessages, meta, isMultiRecipient, attachments);

    // Replace original msgBody with new Thread Container
    msgBody.style.display = 'none';
    if (msgBody.parentNode) {
      msgBody.parentNode.insertBefore(threadContainer, msgBody);
    }
  }

  // Render all thread cards in chronological sequence (Always fully expanded)
  function renderCards(threadContainer, threadMessages, meta, isMultiRecipient, attachments) {
    var oldCards = threadContainer.querySelectorAll('.gm-thread-card, .bm-action-pills-container');
    oldCards.forEach(function (c) { c.remove(); });

    threadMessages.sort(sortChronological);

    threadMessages.forEach(function (msg, idx) {
      var card = document.createElement('div');
      card.className = 'gm-thread-card gm-expanded';
      card.setAttribute('data-msg-idx', idx);

      var parsedAuthor = parseAddress(null, msg.author);
      var isLatest = (idx === threadMessages.length - 1);
      var cardAuthorName = parsedAuthor.name || (isLatest && meta.from.name ? meta.from.name : 'Unknown');
      var cardAuthorEmail = parsedAuthor.email || (isLatest ? meta.from.email : '');
      var cardDate = msg.date || meta.date || 'Today';

      var avatarInitial = getInitial(cardAuthorName || cardAuthorEmail);
      var avatarColor = getAvatarColor(cardAuthorEmail || cardAuthorName);

      var cleanText = cleanBodyDisplay(msg.bodyText);

      var attachHtml = '';
      if (isLatest && attachments && attachments.length > 0) {
        attachHtml = '<div class="gm-msg-attachments">' +
          attachments.map(function (att) {
            return '<a href="' + escapeHtml(att.href) + '" class="gm-attachment-card" target="_blank" download="' + escapeHtml(att.name) + '">' +
              '<div class="gm-attach-icon ' + att.type + '">' + att.type.toUpperCase() + '</div>' +
              '<div class="gm-attach-meta">' +
                '<span class="gm-attach-filename" title="' + escapeHtml(att.name) + '">' + escapeHtml(att.name) + '</span>' +
                '<span class="gm-attach-filesize">' + escapeHtml(att.size || 'Download') + '</span>' +
              '</div>' +
            '</a>';
          }).join('') +
        '</div>';
      }

      var authorEmailHtml = '';
      if (cardAuthorEmail && cardAuthorEmail !== cardAuthorName) {
        authorEmailHtml = '<span class="gm-author-email">&lt;' + escapeHtml(cardAuthorEmail) + '&gt;</span>';
      }

      var recipientDisplay = meta.to.name || meta.to.full || 'me';

      // Gmail Details Popover HTML
      var detailsPopoverHtml = 
        '<div class="gm-details-popover" style="display:none;">' +
          '<table class="gm-details-table">' +
            '<tbody>' +
              '<tr>' +
                '<td class="gm-details-label">from:</td>' +
                '<td class="gm-details-val"><strong>' + escapeHtml(cardAuthorName) + '</strong>' + (cardAuthorEmail && cardAuthorName !== cardAuthorEmail ? ' &lt;' + escapeHtml(cardAuthorEmail) + '&gt;' : '') + '</td>' +
              '</tr>' +
              '<tr>' +
                '<td class="gm-details-label">to:</td>' +
                '<td class="gm-details-val">' + escapeHtml(meta.to.full || meta.to.name || 'me') + '</td>' +
              '</tr>' +
              (meta.cc && meta.cc.full ? '<tr><td class="gm-details-label">cc:</td><td class="gm-details-val">' + escapeHtml(meta.cc.full) + '</td></tr>' : '') +
              (meta.bcc && meta.bcc.full ? '<tr><td class="gm-details-label">bcc:</td><td class="gm-details-val">' + escapeHtml(meta.bcc.full) + '</td></tr>' : '') +
              '<tr>' +
                '<td class="gm-details-label">date:</td>' +
                '<td class="gm-details-val">' + escapeHtml(cardDate) + '</td>' +
              '</tr>' +
              '<tr>' +
                '<td class="gm-details-label">subject:</td>' +
                '<td class="gm-details-val">' + escapeHtml(meta.subject) + '</td>' +
              '</tr>' +
              (meta.mailedBy ? '<tr><td class="gm-details-label">mailed-by:</td><td class="gm-details-val">' + escapeHtml(meta.mailedBy) + '</td></tr>' : '') +
              (meta.signedBy ? '<tr><td class="gm-details-label">signed-by:</td><td class="gm-details-val">' + escapeHtml(meta.signedBy) + '</td></tr>' : '') +
              '<tr>' +
                '<td class="gm-details-label">security:</td>' +
                '<td class="gm-details-val">🔒 Standard encryption (TLS)</td>' +
              '</tr>' +
            '</tbody>' +
          '</table>' +
        '</div>';

      card.innerHTML = 
        '<div class="gm-thread-header">' +
          '<div class="gm-author-meta">' +
            '<div class="gm-avatar" style="background:' + avatarColor + '">' + avatarInitial + '</div>' +
            '<div class="gm-author-names">' +
              '<div style="display:flex; align-items:baseline; gap:6px; flex-wrap:wrap;">' +
                '<span class="gm-author-name">' + escapeHtml(cardAuthorName) + '</span>' +
                authorEmailHtml +
              '</div>' +
              '<button type="button" class="gm-recipient-chip" title="Show details">' +
                '<span>to ' + escapeHtml(recipientDisplay) + '</span>' +
                '<span class="gm-details-arrow">▾</span>' +
              '</button>' +
            '</div>' +
          '</div>' +
          '<div class="gm-header-right">' +
            '<span>' + escapeHtml(cardDate) + '</span>' +
            '<svg title="Star" viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>' +
            '<svg title="Reply" class="gm-btn-quick-reply-icon" viewBox="0 0 24 24"><path d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z"/></svg>' +
          '</div>' +
        '</div>' +
        detailsPopoverHtml +
        '<div class="gm-message-body">' +
          '<div class="gm-main-text">' + escapeHtml(cleanText) + '</div>' +
          attachHtml +
        '</div>';

      // Toggle details popover on recipient chip click
      var chip = card.querySelector('.gm-recipient-chip');
      var popover = card.querySelector('.gm-details-popover');
      var arrow = card.querySelector('.gm-details-arrow');
      if (chip && popover) {
        chip.onclick = function (e) {
          e.stopPropagation();
          var isHidden = (popover.style.display === 'none' || !popover.style.display);
          // Close any other open details popovers
          document.querySelectorAll('.gm-details-popover').forEach(function (p) {
            if (p !== popover) p.style.display = 'none';
          });
          document.querySelectorAll('.gm-details-arrow').forEach(function (a) {
            if (a !== arrow) a.textContent = '▾';
          });
          popover.style.display = isHidden ? 'block' : 'none';
          if (arrow) arrow.textContent = isHidden ? '▴' : '▾';
        };
      }

      // Hovercard for author avatar
      var avEl = card.querySelector('.gm-avatar');
      initHovercard(avEl, cardAuthorName, cardAuthorEmail);

      var qIcon = card.querySelector('.gm-btn-quick-reply-icon');
      if (qIcon) {
        qIcon.onclick = function (e) {
          e.stopPropagation();
          openInlineReply(threadContainer, cardAuthorName, meta.subject, threadMessages, false);
        };
      }

      threadContainer.appendChild(card);
    });

    // Global listener to dismiss details popover when clicking outside
    if (!window.__gmDetailsDismissHooked) {
      window.__gmDetailsDismissHooked = true;
      document.addEventListener('click', function (e) {
        if (!e.target.closest('.gm-details-popover') && !e.target.closest('.gm-recipient-chip')) {
          document.querySelectorAll('.gm-details-popover').forEach(function (p) {
            p.style.display = 'none';
          });
          document.querySelectorAll('.gm-details-arrow').forEach(function (a) {
            a.textContent = '▾';
          });
        }
      });
    }

    // Bottom Action Pills (Reply, Reply All, Forward)
    renderBottomPills(threadContainer, meta.from.name || 'Sender', meta.subject, threadMessages, isMultiRecipient);
  }

  // Clean raw body text: strip trailing quote intros and HTML tags
  function cleanBodyDisplay(text) {
    if (!text) return '';
    var cleaned = text
      .replace(/<br\s*\/?>\s*<p[^>]*id="?reply-intro"?[\s\S]*/i, '')
      .replace(/<blockquote[\s\S]*/i, '')
      .replace(/<p[^>]*id="?reply-intro"?[\s\S]*/i, '')
      .replace(/On\s+[0-9]{4}-[0-9]{2}-[0-9]{2}[\s\S]*?wrote:?[\s\S]*/i, '')
      .replace(/<[^>]+>/g, '')
      .trim();
    return cleaned || text.replace(/<[^>]+>/g, '').trim();
  }

  // Extract all messages from text or blockquotes
  function extractAllThreadMessages(msgBody, currentSender, currentDate) {
    var rawText = msgBody.innerText || msgBody.textContent || '';
    var messages = [];

    var hasPseudoQuotes = /<blockquote|<p[^>]*id="?reply-intro"?|class="?pre"?/i.test(rawText);

    if (hasPseudoQuotes) {
      var splitParts = rawText.split(/<br\s*\/?>\s*<p[^>]*id="?reply-intro"?|<blockquote|<p[^>]*id="?reply-intro"?/i);
      var latestBody = (splitParts[0] || '').trim();

      var onWroteRegex = /On\s+([0-9]{4}-[0-9]{2}-[0-9]{2}[^,\n<]*|[^,\n<]+,\s+[^<]+)\s*,\s*([^<>\n]+(?:<[^>]+>)?)\s+wrote:?/gi;
      var intros = [];
      var match;
      while ((match = onWroteRegex.exec(rawText)) !== null) {
        intros.push(match);
      }

      var innerMatch = rawText.match(/<blockquote>(?:<[^>]+>)*\s*([^<]+)\s*(?:<\/[^>]+>)*<\/blockquote>/i);
      var deepestBody = innerMatch ? innerMatch[1].trim() : '';

      var middleMatch = rawText.match(/<\/blockquote>\s*([^<]+)\s*<\/div>/i);
      var middleBody = middleMatch ? middleMatch[1].trim() : '';

      if (intros.length >= 2 && deepestBody && middleBody) {
        messages.push({
          author: intros[1][2].trim(),
          date: intros[1][1].trim(),
          bodyText: deepestBody
        });

        messages.push({
          author: intros[0][2].trim(),
          date: intros[0][1].trim(),
          bodyText: middleBody
        });

        messages.push({
          author: currentSender,
          date: currentDate,
          bodyText: latestBody
        });

        return messages.sort(sortChronological);
      } else if (intros.length >= 1 && deepestBody) {
        messages.push({
          author: intros[0][2].trim(),
          date: intros[0][1].trim(),
          bodyText: deepestBody
        });
        messages.push({
          author: currentSender,
          date: currentDate,
          bodyText: latestBody
        });
        return messages.sort(sortChronological);
      }
    }

    // Fallback: Real DOM blockquotes
    var container = msgBody.cloneNode(true);
    var bqs = Array.from(container.querySelectorAll('blockquote, .quote_level_1, .quoted-text'));

    if (bqs.length === 0) {
      var fullText = cleanBodyDisplay(rawText);
      return [{
        author: currentSender,
        date: currentDate,
        bodyText: fullText
      }];
    }

    bqs.sort(function (a, b) {
      var dA = 0, pA = a.parentElement;
      while (pA) { if (pA.tagName === 'BLOCKQUOTE' || (pA.classList && pA.classList.contains('quote_level_1'))) dA++; pA = pA.parentElement; }
      var dB = 0, pB = b.parentElement;
      while (pB) { if (pB.tagName === 'BLOCKQUOTE' || (pB.classList && pB.classList.contains('quote_level_1'))) dB++; pB = pB.parentElement; }
      return dB - dA;
    });

    var onWroteRegex2 = /On\s+([0-9]{4}-[0-9]{2}-[0-9]{2}[^,\n<]*|[^,\n<]+,\s+[^<]+)\s*,\s*([^<>\n]+(?:<[^>]+>)?)\s+wrote:?/i;

    var deepestBq = bqs[0];
    var msg1Text = cleanBodyDisplay(deepestBq.innerText);
    var textBefore1 = '';
    var p1 = deepestBq.parentElement;
    if (p1) {
      var fullP1 = p1.innerText || '';
      var idx1 = fullP1.indexOf(deepestBq.innerText.trim());
      if (idx1 > -1) textBefore1 = fullP1.substring(0, idx1);
    }
    var m1 = textBefore1.match(onWroteRegex2);
    var author1 = m1 ? m1[2].trim() : 'Sender';
    var date1 = m1 ? m1[1].trim() : 'Earlier';

    messages.push({
      author: author1,
      date: date1,
      bodyText: msg1Text
    });

    if (deepestBq.parentNode) deepestBq.remove();

    var outerBq = bqs.find(function (b) { return b !== deepestBq; });
    if (outerBq) {
      var msg2Text = cleanBodyDisplay(outerBq.innerText);
      var textBefore2 = container.innerText || '';
      var m2 = textBefore2.match(onWroteRegex2);
      var author2 = m2 ? m2[2].trim() : currentSender;
      var date2 = m2 ? m2[1].trim() : 'Earlier';

      if (msg2Text) {
        messages.push({
          author: author2,
          date: date2,
          bodyText: msg2Text
        });
      }
      if (outerBq.parentNode) outerBq.remove();
    }

    var latestText = cleanBodyDisplay(container.innerText);
    messages.push({
      author: currentSender,
      date: currentDate,
      bodyText: latestText || ' '
    });

    return messages.sort(sortChronological);
  }

  // =========================================================================
  // 2. Bottom Action Pills & Multi-Recipient "Reply All"
  // =========================================================================
  function renderBottomPills(container, sender, subject, threadMessages, isMultiRecipient) {
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
      openInlineReply(container, sender, subject, threadMessages, false);
    };
    pillBox.appendChild(replyBtn);

    // [ 👥 Reply All ] (Feature 2: Multi-Recipient)
    if (isMultiRecipient) {
      var replyAllBtn = document.createElement('button');
      replyAllBtn.type = 'button';
      replyAllBtn.className = 'bm-action-pill bm-action-pill-replyall';
      replyAllBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M7 8V5l-7 7 7 7v-3l-4-4 4-4zm6 1V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z"/></svg> <span>Reply all</span>';
      replyAllBtn.onclick = function (e) {
        e.preventDefault();
        openInlineReply(container, sender, subject, threadMessages, true);
      };
      pillBox.appendChild(replyAllBtn);
    }

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
    pillBox.appendChild(forwardBtn);

    container.appendChild(pillBox);
  }

  // =========================================================================
  // 3. Inline Quick Reply with Attachments & Signature
  // =========================================================================
  function openInlineReply(container, recipient, subject, threadMessages, isReplyAll) {
    var existingBox = container.querySelector('.gm-inline-reply-box');
    if (existingBox) {
      var textarea = existingBox.querySelector('.gm-reply-textarea');
      if (textarea) textarea.focus();
      return;
    }

    var pills = container.querySelector('.bm-action-pills-container');
    if (pills) pills.style.display = 'none';

    var myName = getMyName();
    var myEmail = getMyEmail();
    var myAvatarColor = getAvatarColor(myEmail);
    var myInitial = getInitial(myName);

    var replyLabel = isReplyAll ? '👥 Reply all' : '↩ Reply';

    var replyBox = document.createElement('div');
    replyBox.className = 'gm-inline-reply-box';
    replyBox.innerHTML = 
      '<div class="gm-inline-header">' +
        '<div class="gm-avatar" style="width:28px; height:28px; font-size:12px; background:' + myAvatarColor + '">' + myInitial + '</div>' +
        '<span class="gm-reply-label">' + replyLabel + '</span>' +
        '<span class="gm-reply-to">' + escapeHtml(recipient || 'Recipient') + '</span>' +
        '<button type="button" class="gm-inline-popout" title="Pop-out to full editor">↗</button>' +
      '</div>' +
      '<textarea class="gm-reply-textarea" placeholder="' + (isReplyAll ? 'Reply to all...' : 'Reply to ' + escapeHtml(recipient || '') + '...') + '"></textarea>' +
      '<div class="gm-attachment-chip-list" style="display:none"></div>' +
      '<input type="file" multiple class="gm-inline-file-input" style="display:none">' +
      '<div class="gm-inline-footer">' +
        '<div class="gm-footer-left">' +
          '<button type="button" class="gm-send-pill-btn">' +
            '<svg viewBox="0 0 24 24" width="16" height="16" fill="white"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>' +
            '<span>Send</span>' +
          '</button>' +
          '<button type="button" class="gm-attach-btn" title="Attach files">' +
            '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M16.5 6v11.5c0 2.21-1.79 4-4 4s-4-1.79-4-4V5a2.5 2.5 0 0 1 5 0v10.5c0 .83-.67 1.5-1.5 1.5s-1.5-.67-1.5-1.5V6H9v9.5a3 3 0 0 0 6 0V5a4 4 0 0 0-8 0v12.5c0 3.04 2.46 5.5 5.5 5.5s5.5-2.46 5.5-5.5V6h-1.5z"/></svg>' +
            '<span>Attach</span>' +
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

    textarea.addEventListener('input', function () {
      this.style.height = 'auto';
      this.style.height = (this.scrollHeight) + 'px';
    });

    // Attachment handling (Feature 1: Inline attachments & drag-and-drop)
    var attachedFiles = [];
    var fileInput = replyBox.querySelector('.gm-inline-file-input');
    var attachBtn = replyBox.querySelector('.gm-attach-btn');
    var chipList = replyBox.querySelector('.gm-attachment-chip-list');

    attachBtn.onclick = function () { fileInput.click(); };

    function renderAttachedChips() {
      chipList.innerHTML = '';
      if (attachedFiles.length === 0) {
        chipList.style.display = 'none';
        return;
      }
      chipList.style.display = 'flex';
      attachedFiles.forEach(function (file, idx) {
        var chip = document.createElement('div');
        chip.className = 'gm-attach-chip';
        chip.innerHTML = '<span class="chip-name">' + escapeHtml(file.name) + '</span><span class="chip-size">' + formatBytes(file.size) + '</span><button type="button" class="chip-remove" title="Remove">✕</button>';
        chip.querySelector('.chip-remove').onclick = function () {
          attachedFiles.splice(idx, 1);
          renderAttachedChips();
        };
        chipList.appendChild(chip);
      });
    }

    function addFiles(files) {
      if (!files) return;
      Array.from(files).forEach(function (f) {
        attachedFiles.push(f);
      });
      renderAttachedChips();
    }

    fileInput.onchange = function () {
      addFiles(fileInput.files);
    };

    // Drag and drop listeners on replyBox
    replyBox.addEventListener('dragover', function (e) {
      e.preventDefault();
      replyBox.classList.add('gm-dropzone-active');
    });
    replyBox.addEventListener('dragleave', function (e) {
      e.preventDefault();
      replyBox.classList.remove('gm-dropzone-active');
    });
    replyBox.addEventListener('drop', function (e) {
      e.preventDefault();
      replyBox.classList.remove('gm-dropzone-active');
      if (e.dataTransfer && e.dataTransfer.files) {
        addFiles(e.dataTransfer.files);
      }
    });

    replyBox.querySelector('.gm-inline-popout').onclick = function () {
      var rc = getRcmail();
      if (rc) rc.command(isReplyAll ? 'reply-all' : 'reply', '', this);
    };

    replyBox.querySelector('.gm-discard-btn').onclick = function () {
      replyBox.remove();
      if (pills) pills.style.display = 'flex';
    };

    var sendBtn = replyBox.querySelector('.gm-send-pill-btn');
    var sendAction = function () {
      var replyText = textarea.value.trim();
      if (!replyText && attachedFiles.length === 0) return;

      sendBtn.disabled = true;
      sendBtn.innerHTML = '<span>Sending...</span>';

      sendInlineReply(replyText, recipient, subject, attachedFiles, isReplyAll, function (success, err) {
        if (success) {
          var now = new Date();
          var timeStr = 'Today ' + String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');

          var newMsg = {
            author: myName,
            date: timeStr,
            bodyText: replyText || (attachedFiles.length + ' attachment(s) sent')
          };

          var threadKey = cleanSubjectKey(subject);
          threadMessages.push(newMsg);
          threadMessages.sort(sortChronological);

          replyBox.remove();
          renderCards(container, threadMessages, recipient, myName, subject, false, []);

          showToast('Message sent.');

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

    textarea.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'Enter' || e.keyCode === 13)) {
        e.preventDefault();
        sendAction();
      }
    });
  }

  // Send reply using Roundcube's compose session
  function sendInlineReply(text, recipient, subject, files, isReplyAll, callback) {
    var rc = getRcmail();
    if (!rc || !rc.env) {
      return callback(false, 'Roundcube session not found');
    }

    var uid = rc.env.uid || rc.env.message_uid || '';
    if (!uid && rc.message_list && typeof rc.message_list.get_single_selection === 'function') {
      uid = rc.message_list.get_single_selection();
    }
    var mbox = rc.env.mailbox || 'INBOX';

    var composeAction = isReplyAll ? 'reply-all' : 'reply';
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

      var existingMsg = fd.get('_message') || '';
      var cleanText = escapeHtml(text).replace(/\n/g, '<br>');
      var htmlBody = '<div dir="ltr">' + cleanText + '</div>';

      // Feature 5: Signature insertion
      var sig = getMySignature();
      if (sig) {
        htmlBody += '<br><div class="signature">--<br>' + sig.replace(/\n/g, '<br>') + '</div>';
      }

      if (existingMsg) {
        htmlBody += '<br><div class="gmail_quote">' + existingMsg + '</div>';
      }

      fd.set('_message', htmlBody);
      fd.set('_is_html', '1');
      fd.set('_action', 'send');

      if (isReplyAll) {
        fd.set('_reply_all', '1');
      }

      // Feature 1: Attach files to FormData
      if (files && files.length > 0) {
        files.forEach(function (f) {
          fd.append('_attachments[]', f, f.name);
        });
      }

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

  // Feature 6: Google Workspace Style Sender Profile Hovercard
  var hoverTimer = null;
  function initHovercard(avatarEl, name, email) {
    if (!avatarEl) return;
    avatarEl.addEventListener('mouseenter', function () {
      hoverTimer = setTimeout(function () {
        showHovercard(avatarEl, name, email);
      }, 300);
    });
    avatarEl.addEventListener('mouseleave', function () {
      if (hoverTimer) clearTimeout(hoverTimer);
    });
  }

  function showHovercard(targetEl, name, email) {
    removeHovercard();
    var parsed = parseAddress(null, name);
    var finalName = parsed.name || name || 'Sender';
    var finalEmail = email || parsed.email || '';
    if (finalName === finalEmail && finalEmail.indexOf('@') > -1) {
      var prefix = finalEmail.split('@')[0];
      finalName = prefix.charAt(0).toUpperCase() + prefix.slice(1);
    }

    var card = document.createElement('div');
    card.className = 'gm-hovercard';

    var color = getAvatarColor(finalEmail || finalName);
    var initial = getInitial(finalName || finalEmail);

    card.innerHTML = 
      '<div class="gm-hovercard-header">' +
        '<div class="gm-hovercard-avatar" style="background:' + color + '">' + initial + '</div>' +
        '<div class="gm-hovercard-info">' +
          '<div class="gm-hovercard-name">' + escapeHtml(finalName) + '</div>' +
          '<div class="gm-hovercard-email">' + escapeHtml(finalEmail) + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="gm-hovercard-actions">' +
        '<button type="button" class="gm-hovercard-btn gm-copy-btn">📋 Copy</button>' +
        '<button type="button" class="gm-hovercard-btn gm-search-btn">🔍 Search</button>' +
        '<button type="button" class="gm-hovercard-btn primary gm-compose-btn">✉ Email</button>' +
      '</div>';

    var rect = targetEl.getBoundingClientRect();
    card.style.top = (rect.bottom + window.scrollY + 8) + 'px';
    card.style.left = Math.max(16, (rect.left + window.scrollX - 20)) + 'px';

    document.body.appendChild(card);

    card.querySelector('.gm-copy-btn').onclick = function () {
      var toCopy = finalEmail || finalName || '';
      navigator.clipboard.writeText(toCopy);
      this.innerText = '✓ Copied!';
      var self = this;
      setTimeout(function () { self.innerText = '📋 Copy'; }, 2000);
    };

    card.querySelector('.gm-search-btn').onclick = function () {
      removeHovercard();
      var rc = getRcmail();
      var q = finalEmail || finalName || '';
      if (rc && rc.search) rc.search('from:' + q);
    };

    card.querySelector('.gm-compose-btn').onclick = function () {
      removeHovercard();
      var rc = getRcmail();
      if (rc) rc.command('compose', finalEmail || '', this);
    };

    card.addEventListener('mouseleave', function () {
      removeHovercard();
    });
  }

  function removeHovercard() {
    var old = document.querySelector('.gm-hovercard');
    if (old) old.remove();
  }

  // Feature 4: Gmail Single-Key Keyboard Shortcuts
  function initKeyboardShortcuts() {
    window.addEventListener('keydown', function (e) {
      var tag = (e.target && e.target.tagName) ? e.target.tagName.toUpperCase() : '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target && e.target.isContentEditable)) {
        if (e.key === 'Escape') {
          var activeBox = document.querySelector('.gm-inline-reply-box');
          if (activeBox) activeBox.remove();
          removeHovercard();
        }
        return;
      }

      if (e.ctrlKey || e.metaKey || e.altKey) return;

      var rc = getRcmail();
      if (e.key === 'r') {
        e.preventDefault();
        var rBtn = document.querySelector('.bm-action-pill');
        if (rBtn) rBtn.click();
      } else if (e.key === 'a') {
        e.preventDefault();
        var rAllBtn = document.querySelector('.bm-action-pill-replyall') || document.querySelector('.bm-action-pill');
        if (rAllBtn) rAllBtn.click();
      } else if (e.key === 'f') {
        e.preventDefault();
        if (rc) rc.command('forward', '', this);
      } else if (e.key === 'j') {
        e.preventDefault();
        if (rc && rc.message_list && rc.message_list.select_next) rc.message_list.select_next();
      } else if (e.key === 'k') {
        e.preventDefault();
        if (rc && rc.message_list && rc.message_list.select_prev) rc.message_list.select_prev();
      } else if (e.key === 'e') {
        e.preventDefault();
        if (rc) rc.command('plugin.archive', '', this);
      } else if (e.key === '#') {
        e.preventDefault();
        if (rc) rc.command('delete', '', this);
      } else if (e.key === '/') {
        e.preventDefault();
        var searchInput = (window.parent ? window.parent.document : document).querySelector('#mailsearchbox, input[name="_q"]');
        if (searchInput) {
          searchInput.focus();
          searchInput.select();
        }
      } else if (e.key === 'Escape') {
        removeHovercard();
      }
    });
  }

  // Inject navigation and back buttons when on compose page
  function injectComposeNavButtons() {
    // 1. BillionMail logo click -> back to inbox
    var logo = document.querySelector('#layout-menu .popover-header img, #layout-menu #logo');
    if (logo && !logo.getAttribute('data-bm-nav')) {
      logo.setAttribute('data-bm-nav', 'true');
      logo.style.cursor = 'pointer';
      logo.title = 'Back to Inbox';
      logo.onclick = function (e) {
        e.preventDefault();
        window.location.href = './?_task=mail';
      };
    }

    // 2. Toolbar Back Button
    var toolbar = document.querySelector('#messagetoolbar');
    if (toolbar && !toolbar.querySelector('.gm-compose-back-btn')) {
      var backBtn = document.createElement('a');
      backBtn.href = './?_task=mail';
      backBtn.className = 'button gm-compose-back-btn';
      backBtn.title = 'Back to Inbox';
      backBtn.innerHTML = '<svg viewBox="0 0 24 24" style="width:16px;height:16px;vertical-align:middle;fill:currentColor;margin-right:6px;"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg><span>Back to Mail</span>';
      backBtn.onclick = function (e) {
        e.preventDefault();
        var rc = getRcmail();
        if (rc && typeof rc.command === 'function') {
          rc.command('list', 'INBOX');
        } else {
          window.location.href = './?_task=mail';
        }
      };
      toolbar.insertBefore(backBtn, toolbar.firstChild);
    }

    // 3. Discard Button next to Send
    var formButtons = document.querySelector('.formbuttons');
    if (formButtons && !formButtons.querySelector('.gm-discard-btn')) {
      var discardBtn = document.createElement('button');
      discardBtn.type = 'button';
      discardBtn.className = 'gm-discard-btn';
      discardBtn.title = 'Discard Draft';
      discardBtn.innerHTML = '<svg viewBox="0 0 24 24" style="width:16px;height:16px;vertical-align:middle;fill:currentColor;margin-right:4px;"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg><span>Discard</span>';
      discardBtn.onclick = function (e) {
        e.preventDefault();
        if (confirm('Discard this draft and return to inbox?')) {
          window.location.href = './?_task=mail';
        }
      };
      var sendBtn = formButtons.querySelector('.send, button[type="submit"]');
      if (sendBtn && sendBtn.nextSibling) {
        formButtons.insertBefore(discardBtn, sendBtn.nextSibling);
      } else {
        formButtons.appendChild(discardBtn);
      }
    }
  }

  // Intercept standard Roundcube compose form to persist sent replies
  function hookComposeForm() {
    injectComposeNavButtons();

  }

  // Intercept standard Roundcube compose form to inject Back and Discard navigation buttons
  function hookComposeForm() {
    injectComposeNavButtons();
  }

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

  var debounceTimer = null;
  function debouncedInit() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(function () {
      transformThreadView();
      hookComposeForm();
    }, 150);
  }

  function enforceFlatListMode() {
    var rc = getRcmail();
    if (rc && rc.env && rc.env.threading && typeof rc.set_list_options === 'function') {
      try {
        rc.set_list_options([], rc.env.sort_col || 'date', rc.env.sort_order || 'DESC', 0);
      } catch (e) {}
    }
  }

  // Observer to run safely when an email is loaded
  function init() {
    // Purge any legacy artificial thread caches from localStorage
    try {
      var keysToRemove = [];
      for (var k = 0; k < localStorage.length; k++) {
        var keyName = localStorage.key(k);
        if (keyName && keyName.indexOf('bm_thread_') === 0) {
          keysToRemove.push(keyName);
        }
      }
      keysToRemove.forEach(function (k) { localStorage.removeItem(k); });
    } catch (e) {}

    enforceFlatListMode();
    transformThreadView();
    hookComposeForm();
    initKeyboardShortcuts();

    var observer = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var target = mutations[i].target;
        if (target && target.closest && (
          target.closest('.gm-thread-container') || 
          target.closest('.gm-thread-card') ||
          target.closest('.gm-hovercard') ||
          target.closest('.gm-toast') ||
          target.closest('.gm-inline-reply-box')
        )) {
          return; // Ignore internal UI mutations
        }
      }
      debouncedInit();
    });

    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true });
    }

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

    if (!window.__bm_refresh_interval) {
      window.__bm_refresh_interval = setInterval(function () {
        var rc = getRcmail();
        if (rc && typeof rc.check_recent === 'function') {
          rc.check_recent();
        }
      }, 20000);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
