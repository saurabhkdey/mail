<?php
    # Product name
    $config['product_name'] = 'BillionMail';

    $config['mime_types'] = '/var/roundcube/config/mime.types';
       
    # Modern Skin & Responsive Layout
    $config['skin'] = 'elastic';
    $config['skin_style'] = 'auto'; // Supports light and dark mode automatically
    $config['layout'] = 'widescreen'; // Modern 3-column split view (Folders | Message List | Preview Pane)
    $config['preview_pane'] = true; // Show preview pane by default
    $config['mail_pagesize'] = 50;
    $config['addressbook_pagesize'] = 50;
    $config['check_all_folders'] = true;
    $config['refresh_interval'] = 60; // Auto check mail every 60 seconds
    $config['default_list_mode'] = 'threads'; // Gmail-style conversation threading
    $config['autoexpand_threads'] = 2; // Expand threads with unread messages

    # Modern Reply & Compose Experience
    $config['top_posting'] = true; // Crucial: Type reply above quoted message (modern default)
    $config['sig_above'] = true; // Place signature directly beneath reply, above quotes
    $config['strip_existing_sig'] = true; // Strip previous signatures in reply threads
    $config['reply_mode'] = 0; // 0 = reply to sender, 1 = reply all
    $config['reply_all_mode'] = 0;
    $config['htmleditor'] = 1; // 1 = Rich HTML editor by default with formatting, links, emojis
    $config['draft_autosave'] = 30; // Auto-save draft every 30 seconds
    $config['show_images'] = 1; // Display inline images safely
    $config['message_show_alternative'] = false; // Render rich HTML part of email by default
    $config['mime_param_folding'] = 0; // Fixes attachment filenames for modern Outlook/Gmail/Apple Mail
    $config['compose_responses_static'] = true;
    $config['autocomplete_single'] = true;
    $config['max_message_size'] = '50M'; // Allow large attachments up to 50MB
    $config['session_lifetime'] = 180; // 3-hour session lifetime (prevents premature logout while composing)
    $config['spellcheck_engine'] = 'browser'; // Native modern browser spellchecking in composer

    # Plugins (Modernized set including archive, markasjunk, attachment_reminder, hide_blockquote)
    $config['plugins'] = array(
        'password',
        'userinfo',
        'newmail_notifier',
        'emoticons',
        'zipdownload',
        'archive',
        'markasjunk',
        'attachment_reminder',
        'hide_blockquote',
        'vcard_attachments'
    );

    # Password
    $config['password_query'] = 'update mailbox set password = %P where username = %u';
    $config['password_algorithm'] = 'md5-crypt';

    # Optional extra configuration override
    if (file_exists(__DIR__ . '/extra.php')) {
        include_once(__DIR__ . '/extra.php');
    }
