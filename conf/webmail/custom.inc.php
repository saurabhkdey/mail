<?php
    # Product name
    $config['product_name'] = 'BillionMail';

    $config['mime_types'] = '/var/roundcube/config/mime.types';
       
    # Modern Plugins Suite
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

    # Modern Elastic Skin & Adaptive Styling
    $config['skin'] = 'elastic';
    $config['skin_style'] = 'auto';

    # 3-Column Widescreen Layout (Folders | Message List | Reading Pane)
    $config['layout'] = 'widescreen';
    $config['preview_pane'] = true;

    # Flat Chronological Message List (Individual Emails)
    $config['default_list_mode'] = 'list';
    $config['autoexpand_threads'] = 0;

    # Composer & Reply Flow (Top-posting, Signature above quotes)
    $config['reply_mode'] = 1;
    $config['top_posting'] = true;
    $config['sig_above'] = true;
    $config['strip_existing_sig'] = true;
    $config['htmleditor'] = 1;
    $config['draft_autosave'] = 30;
    $config['spellcheck_engine'] = 'browser';
    $config['mime_param_folding'] = 0;

    # Performance, Message Limits & Session Lifetime
    $config['max_message_size'] = '50M';
    $config['session_lifetime'] = 180;

# Please create an extra file: extra.php. Used to persist overrides Configuration

