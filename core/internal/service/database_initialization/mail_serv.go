package database_initialization

import (
	"context"
	"github.com/gogf/gf/v2/frame/g"
)

func init() {
	registerHandler(func() {
		sqlList := []string{
			`--  domain 
			CREATE TABLE IF NOT EXISTS domain (
				domain varchar(255) NOT NULL,
				a_record varchar(255) NOT NULL DEFAULT '',
				mailboxes int NOT NULL DEFAULT 50,                       -- Number of emails created
				mailbox_quota BIGINT NOT NULL DEFAULT 5368709120,        -- Default space size of mailbox
				quota BIGINT NOT NULL DEFAULT 10737418240,               -- Domain name quota
				rate_limit INT DEFAULT 12,                               -- How many emails per second
				create_time INT NOT NULL default 0,
				active SMALLINT NOT NULL DEFAULT 1,
				urls TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
				hasbrandinfo SMALLINT NOT NULL DEFAULT 0,
				current_usage BIGINT NOT NULL DEFAULT 0,	
				PRIMARY KEY (domain)
			)`,

			`--  mailbox 
			CREATE TABLE IF NOT EXISTS mailbox (
				username varchar(255) NOT NULL,
				password varchar(255) NOT NULL,
				password_encode varchar(255) NOT NULL,
				full_name varchar(255) NOT NULL,
				is_admin smallint NOT NULL DEFAULT 0,
				maildir varchar(255) NOT NULL,
				quota bigint NOT NULL DEFAULT 0,
				local_part varchar(255) NOT NULL,
				domain varchar(255) NOT NULL,
				create_time int NOT NULL default 0,
				update_time int NOT NULL default 0,
				active SMALLINT NOT NULL DEFAULT 1,
				used_quota BIGINT NOT NULL DEFAULT 0,	
				quota_active SMALLINT NOT NULL DEFAULT 1,
				PRIMARY KEY (username)
			)`,

			`--  alias 
			CREATE TABLE IF NOT EXISTS alias (
				address varchar(255) NOT NULL,
				goto text NOT NULL,
				domain varchar(255) NOT NULL,
				create_time int NOT NULL default 0,
				update_time int NOT NULL default 0,
				active smallint NOT NULL DEFAULT 1,
				PRIMARY KEY (address)
			)`,

			`--  bm_bcc 
			CREATE TABLE IF NOT EXISTS bm_bcc (
				id SERIAL PRIMARY KEY,
				type TEXT NOT NULL, -- 'sender' or 'recipient'
				address TEXT NOT NULL,
				goto TEXT NOT NULL,
				domain varchar(255) NOT NULL,
				create_time int NOT NULL default 0,
				update_time int NOT NULL default 0,
				active smallint NOT NULL DEFAULT 1
			)`,
			`--  bm_relay 
			CREATE TABLE IF NOT EXISTS bm_relay (
				id BIGSERIAL PRIMARY KEY,
				remark varchar(255), -- Remarks
				rtype varchar(30),  -- Relay type: gmail , sendgrid, custom, aws, mailgun, local 
				sender_domain varchar(255) NOT NULL, -- Sender domain, e.g., "@example.com"
				relay_host varchar(255) NOT NULL, -- Relay server address"
				relay_port varchar(10) NOT NULL, -- Relay server port, e.g., "587"
				auth_user varchar(255) NOT NULL, -- SMTP authentication username
				auth_password varchar(255) NOT NULL, -- SMTP authentication password (consider encrypted storage)
				ip varchar(255), -- IP used to remind users to update SPF records (optional)
				host varchar(255), -- Host used to remind users to update SPF records (optional)
				create_time int NOT NULL default 0,
				update_time int NOT NULL default 0,
				active smallint NOT NULL DEFAULT 1,  -- Whether this relay configuration is enabled
				auth_method varchar(20), -- Authentication method: LOGIN, PLAIN, CRAM-MD5, NONE
				tls_protocol varchar(20), -- TLS protocol: STARTTLS, SSL/TLS, NONE
				skip_tls_verify smallint DEFAULT 0, -- Whether to skip TLS verification: 1-skip, 0-do not skip
				helo_name varchar(255), -- HELO hostname
				smtp_name varchar(50), -- Unique name of the SMTP server
				header_json text, -- Custom email headers in JSON format
				max_concurrency int DEFAULT 10, -- Maximum concurrent connections
				max_retries int DEFAULT 2, -- Maximum retry attempts
				max_idle_time varchar(10) DEFAULT '15s', -- Maximum idle connection time
				max_wait_time varchar(10) DEFAULT '5s' -- Maximum wait time
			)`,
			`--  alias_domain 
			CREATE TABLE IF NOT EXISTS alias_domain (
				alias_domain varchar(255) NOT NULL, 
				target_domain varchar(255) NOT NULL,
				create_time int NOT NULL default 0,
				update_time int NOT NULL default 0,
				active smallint NOT NULL DEFAULT 1,
				PRIMARY KEY (alias_domain)
			)`,
			`--  bm_console_ip_whitelist
			CREATE TABLE IF NOT EXISTS bm_console_ip_whitelist (
    				id SERIAL PRIMARY KEY,
    				ip varchar(45) NOT NULL, -- IPv4 or IPv6
    				ip_type smallint NOT NULL DEFAULT 1, -- 'IPv4:1 ,IPv6:2'	
    				create_time int NOT NULL default 0,
    				UNIQUE (ip)
    			
			)`,
		}

		for _, sql := range sqlList {
			_, err := g.DB().Exec(context.Background(), sql)
			if err != nil {
				g.Log().Error(context.Background(), "Failed to create mail server tables:", err)
				return
			}
		}

		// domain
		_ = AddColumnIfNotExists("domain", "urls", "TEXT[]", "'{}'::TEXT[]", false)
		_ = AddColumnIfNotExists("domain", "hasbrandinfo", "SMALLINT", "0", false)
		_ = AddColumnIfNotExists("domain", "current_usage", "BIGINT", "0", true)


		// mailbox used quota column
		_ = AddColumnIfNotExists("mailbox", "used_quota", "BIGINT", "0", true)
		_ = AddColumnIfNotExists("mailbox", "quota_active", "SMALLINT", "1", true)

		// Setup automatic full_name synchronization between mailbox and Roundcube identities
		triggerSQL := []string{
			`CREATE OR REPLACE FUNCTION sync_identity_name()
			RETURNS TRIGGER AS $$
			BEGIN
				IF NEW.name IS NULL OR TRIM(NEW.name) = '' THEN
					SELECT full_name INTO NEW.name 
					FROM mailbox 
					WHERE username = NEW.email;
					
					IF NEW.name IS NULL OR TRIM(NEW.name) = '' THEN
						NEW.name := INITCAP(REPLACE(SPLIT_PART(NEW.email, '@', 1), '.', ' '));
					END IF;
				END IF;
				RETURN NEW;
			END;
			$$ LANGUAGE plpgsql;`,
			`DROP TRIGGER IF EXISTS trg_sync_identity_name ON identities;`,
			`CREATE TRIGGER trg_sync_identity_name
			BEFORE INSERT OR UPDATE ON identities
			FOR EACH ROW
			EXECUTE FUNCTION sync_identity_name();`,
			`CREATE OR REPLACE FUNCTION sync_mailbox_to_identity()
			RETURNS TRIGGER AS $$
			BEGIN
				IF NEW.full_name IS NOT NULL AND TRIM(NEW.full_name) != '' THEN
					UPDATE identities 
					SET name = NEW.full_name 
					WHERE email = NEW.username;
				END IF;
				RETURN NEW;
			END;
			$$ LANGUAGE plpgsql;`,
			`DROP TRIGGER IF EXISTS trg_sync_mailbox_to_identity ON mailbox;`,
			`CREATE TRIGGER trg_sync_mailbox_to_identity
			AFTER INSERT OR UPDATE ON mailbox
			FOR EACH ROW
			EXECUTE FUNCTION sync_mailbox_to_identity();`,
		}
		for _, q := range triggerSQL {
			_, _ = g.DB().Exec(context.Background(), q)
		}
	})
}
