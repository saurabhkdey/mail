#!/bin/bash
sudo sed -i "s/\$config\['default_list_mode'\] = 'threads';/\$config\['default_list_mode'\] = 'list';/g" /opt/BillionMail/webmail-data/config/config.inc.php
sudo sed -i "s/\$config\['autoexpand_threads'\] = 1;/\$config\['autoexpand_threads'\] = 0;/g" /opt/BillionMail/webmail-data/config/config.inc.php
grep -n "default_list_mode" /opt/BillionMail/webmail-data/config/config.inc.php
sudo cp -r /opt/BillionMail/conf/webmail/theme/* /opt/BillionMail/webmail-data/theme/
sudo chown -R www-data:www-data /opt/BillionMail/webmail-data/theme
sudo docker restart billionmail-webmail-billionmail-1
