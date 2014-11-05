-----------------------------------------
------- new supplier test cases ---------
-----------------------------------------
select * from t_message where ts > sysdate - 1 order by ts desc;
select * from t_message where ts > sysdate - 1 and content like '%4243444546475%' order by ts desc;

-- 0. clear existing supplier data if present
begin sp_purge_party_by_gln('4243444546475'); commit; end;
/

-- 1. add supplier party
-- submit 01_BPR_4243444546475_add.xml
select * from t_party where gln = '4243444546475';

-- 2. party addition approved by GR
-- modify RequestingDocumentInstanceIdentifier and submit 02_BPR_4243444546475_add_Response-from-GR.xml
-- or, manually update status:
update t_party set processing_status_id = 10 where gln = '4243444546475';

-- 3. register new catalog item
-- submit 03_CIN_add_gtin_10036016500279_10024951191010.xml
select * from t_catalog_item tci, t_party tp where tci.info_provider_party_id = tp.party_id and tp.gln = '4243444546475';

-- 4. item addition approved by GR
-- modify RequestingDocumentInstanceIdentifier and submit 04_CIN_add_gtin_10036016500279_10024951191010_Response-from-GR.xml
-- or, manually update status:
update t_catalog_item set catalog_item_state_id = 4 where catalog_item_state_id = 3;

-- 5. subscribe test recipient to supplier GLN
-- add local subscription record and inform GR:
-- submit 05_CIS_add_gtin-10036016500279_dr-1100001011292.xml 
select * from t_catalog_item_subscription order by created_ts desc;

-- 6. receive official GR request and create active subscription:
-- submit 06_CIS_add_gtin-10036016500279_dr-1100001011292_from_GR.xml 
select * from t_catalog_item_subscription order by created_ts desc;

-- 7. publish item to test recipient
-- submit 07_CIP_GLN_add_gtin-10036016500279_dr-1100001011292.xml
select * from t_catalog_item_publication order by created_ts desc; -- verify publication record
select * from t_catalog_item_synch_list tsl, t_synchronization_status tss where tsl.synchronization_status_id = tss.synchronization_status_id order by tsl.ts desc;          -- verify new synch list entry
select * from t_synch_list_queue slq order by slq.ts desc;         -- verify new synch list queue for CIN out

-- 8. update catalog item to add nutritional data
-- submit 08_CIN_update_gtin_10036016500279_10036016500279_foodExt.xml
select * from t_catalog_item tci, t_party tp where tci.info_provider_party_id = tp.party_id and tp.gln = '4243444546475'; -- verify item status and updated details
select * from t_catalog_item_synch_list tsl, t_synchronization_status tss where tsl.synchronization_status_id = tss.synchronization_status_id order by tsl.ts desc;          -- verify new synch list entry
select * from t_synch_list_queue slq order by slq.ts desc;         -- verify new synch list queue for CIN out

-- 9. issue RFCIN
-- submit 09_RFCIN_add_gtin-10036016500279_dr-1100001011292.xml
select * from t_catalog_item_subscription order by created_ts desc;

-- 10. receive RFCIN from GR
-- submit 010_RFCIN_from_GR_add_gtin-10036016500279_dr-1100001011292.xml
select * from t_synch_list_queue slq order by slq.ts desc;         -- verify new synch list queue for CIN out
