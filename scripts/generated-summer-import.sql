-- Summer 2026 import SQL
BEGIN;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM seasons WHERE name = 'קיץ 2026') THEN RAISE EXCEPTION 'Season already exists'; END IF; END $$;
INSERT INTO seasons (id, name, start_date, end_date, active) VALUES ('78cc8b68-f22e-4d7b-98e8-3b48118b0283', 'קיץ 2026', '2026-05-25', '2026-07-02', false);
INSERT INTO products (id, season_id, template_id, name, start_time, end_time, instructor_name, schedule_pattern)
     VALUES ('b8efb38e-e674-425a-afc7-cdf67d37c32b', '78cc8b68-f22e-4d7b-98e8-3b48118b0283', 'bd5a0855-1181-4c76-814c-742164fb83ae', 'לימוד שחייה 1', '17:30:00', '18:15:00', 'אנדי מימון', '{"type":"course_series","weekdays":[2,4],"course_start":"2026-05-25","course_end":"2026-07-02"}'::jsonb);
INSERT INTO products (id, season_id, template_id, name, start_time, end_time, instructor_name, schedule_pattern)
     VALUES ('0da52bcf-ed63-4628-bf10-81ef86be87ca', '78cc8b68-f22e-4d7b-98e8-3b48118b0283', 'bd5a0855-1181-4c76-814c-742164fb83ae', 'לימוד שחייה 2', '17:15:00', '18:00:00', 'אנדי מימון', '{"type":"course_series","weekdays":[3,5],"course_start":"2026-05-26","course_end":"2026-07-03"}'::jsonb);
INSERT INTO products (id, season_id, template_id, name, start_time, end_time, instructor_name, schedule_pattern)
     VALUES ('22488a65-8387-4b50-9277-71f875cff7ed', '78cc8b68-f22e-4d7b-98e8-3b48118b0283', 'bd5a0855-1181-4c76-814c-742164fb83ae', 'לימוד שחייה 3', '18:00:00', '18:45:00', 'אנדי מימון', '{"type":"course_series","weekdays":[3,5],"course_start":"2026-05-26","course_end":"2026-07-03"}'::jsonb);
INSERT INTO products (id, season_id, template_id, name, start_time, end_time, instructor_name, schedule_pattern)
     VALUES ('aacd7a4b-0c81-42fa-9440-61c2667d8f8c', '78cc8b68-f22e-4d7b-98e8-3b48118b0283', 'bd5a0855-1181-4c76-814c-742164fb83ae', 'לימוד שחייה 1', '16:30:00', '17:15:00', 'ירדן', '{"type":"course_series","weekdays":[2,4],"course_start":"2026-05-25","course_end":"2026-07-02"}'::jsonb);
INSERT INTO products (id, season_id, template_id, name, start_time, end_time, instructor_name, schedule_pattern)
     VALUES ('e59285ab-93f7-4185-b4b9-0e5d3b5ef1e1', '78cc8b68-f22e-4d7b-98e8-3b48118b0283', 'bd5a0855-1181-4c76-814c-742164fb83ae', 'לימוד שחייה 2', '17:15:00', '18:00:00', 'אליאן שם טוב+ דביר', '{"type":"course_series","weekdays":[2,4],"course_start":"2026-05-25","course_end":"2026-07-02"}'::jsonb);
INSERT INTO products (id, season_id, template_id, name, start_time, end_time, instructor_name, schedule_pattern)
     VALUES ('a449134e-02a9-4755-8735-9d445ce3cdab', '78cc8b68-f22e-4d7b-98e8-3b48118b0283', 'bd5a0855-1181-4c76-814c-742164fb83ae', 'לימוד שחייה 3', '16:30:00', '17:15:00', '', '{"type":"course_series","weekdays":[3,5],"course_start":"2026-05-25","course_end":"2026-07-02"}'::jsonb);
INSERT INTO products (id, season_id, template_id, name, start_time, end_time, instructor_name, schedule_pattern)
     VALUES ('32873f2f-d6c2-4fec-8252-54ed70cb5375', '78cc8b68-f22e-4d7b-98e8-3b48118b0283', 'bd5a0855-1181-4c76-814c-742164fb83ae', 'לימוד שחייה 1', '16:30:00', '17:15:00', '', '{"type":"course_series","weekdays":[4],"course_start":"2026-05-25","course_end":"2026-07-02"}'::jsonb);
INSERT INTO products (id, season_id, template_id, name, start_time, end_time, instructor_name, schedule_pattern)
     VALUES ('544e9157-40d1-4d5c-bf2b-1b5e197fc231', '78cc8b68-f22e-4d7b-98e8-3b48118b0283', 'bd5a0855-1181-4c76-814c-742164fb83ae', 'לימוד שחייה 2', '17:15:00', '18:00:00', '', '{"type":"course_series","weekdays":[4],"course_start":"2026-05-25","course_end":"2026-07-02"}'::jsonb);
INSERT INTO products (id, season_id, template_id, name, start_time, end_time, instructor_name, schedule_pattern)
     VALUES ('41da54dc-105b-40e0-a9fa-c35e20847575', '78cc8b68-f22e-4d7b-98e8-3b48118b0283', 'bd5a0855-1181-4c76-814c-742164fb83ae', 'לימוד שחייה 3', '18:00:00', '18:45:00', '', '{"type":"course_series","weekdays":[4],"course_start":"2026-05-25","course_end":"2026-07-02"}'::jsonb);
INSERT INTO products (id, season_id, template_id, name, start_time, end_time, instructor_name, schedule_pattern)
     VALUES ('93c0032e-f38d-4254-b9d6-dffe9e034f6d', '78cc8b68-f22e-4d7b-98e8-3b48118b0283', 'bd5a0855-1181-4c76-814c-742164fb83ae', 'לימוד שחייה 4', '16:30:00', '17:15:00', '', '{"type":"course_series","weekdays":[2,4],"course_start":"2026-05-25","course_end":"2026-07-02"}'::jsonb);
INSERT INTO products (id, season_id, template_id, name, start_time, end_time, instructor_name, schedule_pattern)
     VALUES ('7ca64e61-ce9e-46df-bcdf-2d934fb6488e', '78cc8b68-f22e-4d7b-98e8-3b48118b0283', 'bd5a0855-1181-4c76-814c-742164fb83ae', 'לימוד שחייה 5', '17:15:00', '18:00:00', '', '{"type":"course_series","weekdays":[2,4],"course_start":"2026-05-25","course_end":"2026-07-02"}'::jsonb);
INSERT INTO products (id, season_id, template_id, name, start_time, end_time, instructor_name, schedule_pattern)
     VALUES ('bbb68f00-0821-41d0-82e9-325658041f07', '78cc8b68-f22e-4d7b-98e8-3b48118b0283', 'bd5a0855-1181-4c76-814c-742164fb83ae', 'לימוד שחייה 6', '18:00:00', '18:45:00', '', '{"type":"course_series","weekdays":[2,4],"course_start":"2026-05-25","course_end":"2026-07-02"}'::jsonb);
INSERT INTO products (id, season_id, template_id, name, start_time, end_time, instructor_name, schedule_pattern)
     VALUES ('d43f6d59-6a65-43cc-852d-04cc351031cd', '78cc8b68-f22e-4d7b-98e8-3b48118b0283', 'bd5a0855-1181-4c76-814c-742164fb83ae', 'לימוד שחייה 7', '16:30:00', '17:15:00', '', '{"type":"course_series","weekdays":[3,5],"course_start":"2026-05-25","course_end":"2026-07-02"}'::jsonb);
INSERT INTO products (id, season_id, template_id, name, start_time, end_time, instructor_name, schedule_pattern)
     VALUES ('e6e61d9e-58a1-49ce-bf35-6e589a3aba41', '78cc8b68-f22e-4d7b-98e8-3b48118b0283', 'bd5a0855-1181-4c76-814c-742164fb83ae', 'לימוד שחייה 8', '17:15:00', '18:00:00', '', '{"type":"course_series","weekdays":[3,5],"course_start":"2026-05-25","course_end":"2026-07-02"}'::jsonb);
INSERT INTO products (id, season_id, template_id, name, start_time, end_time, instructor_name, schedule_pattern)
     VALUES ('b041ea05-5a81-48b7-97bc-80553a8956cf', '78cc8b68-f22e-4d7b-98e8-3b48118b0283', 'bd5a0855-1181-4c76-814c-742164fb83ae', 'לימוד שחייה 9', '18:00:00', '18:45:00', '', '{"type":"course_series","weekdays":[3,5],"course_start":"2026-05-25","course_end":"2026-07-02"}'::jsonb);
SELECT public.generate_course_series_sessions('b8efb38e-e674-425a-afc7-cdf67d37c32b'::uuid);
SELECT public.generate_course_series_sessions('0da52bcf-ed63-4628-bf10-81ef86be87ca'::uuid);
SELECT public.generate_course_series_sessions('22488a65-8387-4b50-9277-71f875cff7ed'::uuid);
SELECT public.generate_course_series_sessions('aacd7a4b-0c81-42fa-9440-61c2667d8f8c'::uuid);
SELECT public.generate_course_series_sessions('e59285ab-93f7-4185-b4b9-0e5d3b5ef1e1'::uuid);
SELECT public.generate_course_series_sessions('a449134e-02a9-4755-8735-9d445ce3cdab'::uuid);
SELECT public.generate_course_series_sessions('32873f2f-d6c2-4fec-8252-54ed70cb5375'::uuid);
SELECT public.generate_course_series_sessions('544e9157-40d1-4d5c-bf2b-1b5e197fc231'::uuid);
SELECT public.generate_course_series_sessions('41da54dc-105b-40e0-a9fa-c35e20847575'::uuid);
SELECT public.generate_course_series_sessions('93c0032e-f38d-4254-b9d6-dffe9e034f6d'::uuid);
SELECT public.generate_course_series_sessions('7ca64e61-ce9e-46df-bcdf-2d934fb6488e'::uuid);
SELECT public.generate_course_series_sessions('bbb68f00-0821-41d0-82e9-325658041f07'::uuid);
SELECT public.generate_course_series_sessions('d43f6d59-6a65-43cc-852d-04cc351031cd'::uuid);
SELECT public.generate_course_series_sessions('e6e61d9e-58a1-49ce-bf35-6e589a3aba41'::uuid);
SELECT public.generate_course_series_sessions('b041ea05-5a81-48b7-97bc-80553a8956cf'::uuid);
UPDATE families SET parent_name = COALESCE('מיכל', parent_name)
     WHERE regexp_replace(phone, '[^0-9]', '', 'g') = '0526768272';
INSERT INTO families (phone, parent_name)
     SELECT '052-6768272', 'מיכל'
     WHERE NOT EXISTS (
       SELECT 1 FROM families WHERE regexp_replace(phone, '[^0-9]', '', 'g') = '0526768272'
     );
UPDATE families SET parent_name = COALESCE('יוסף', parent_name)
     WHERE regexp_replace(phone, '[^0-9]', '', 'g') = '0507475771';
INSERT INTO families (phone, parent_name)
     SELECT '050-7475771', 'יוסף'
     WHERE NOT EXISTS (
       SELECT 1 FROM families WHERE regexp_replace(phone, '[^0-9]', '', 'g') = '0507475771'
     );
UPDATE families SET parent_name = COALESCE('שאנל', parent_name)
     WHERE regexp_replace(phone, '[^0-9]', '', 'g') = '0542616000';
INSERT INTO families (phone, parent_name)
     SELECT '054-2616000', 'שאנל'
     WHERE NOT EXISTS (
       SELECT 1 FROM families WHERE regexp_replace(phone, '[^0-9]', '', 'g') = '0542616000'
     );
UPDATE families SET parent_name = COALESCE('לודמילה', parent_name)
     WHERE regexp_replace(phone, '[^0-9]', '', 'g') = '0546546610';
INSERT INTO families (phone, parent_name)
     SELECT '054-6546610', 'לודמילה'
     WHERE NOT EXISTS (
       SELECT 1 FROM families WHERE regexp_replace(phone, '[^0-9]', '', 'g') = '0546546610'
     );
UPDATE families SET parent_name = COALESCE('אנה', parent_name)
     WHERE regexp_replace(phone, '[^0-9]', '', 'g') = '0523207077';
INSERT INTO families (phone, parent_name)
     SELECT '052-3207077', 'אנה'
     WHERE NOT EXISTS (
       SELECT 1 FROM families WHERE regexp_replace(phone, '[^0-9]', '', 'g') = '0523207077'
     );
UPDATE families SET parent_name = COALESCE('שחר', parent_name)
     WHERE regexp_replace(phone, '[^0-9]', '', 'g') = '0503405283';
INSERT INTO families (phone, parent_name)
     SELECT '050-3405283', 'שחר'
     WHERE NOT EXISTS (
       SELECT 1 FROM families WHERE regexp_replace(phone, '[^0-9]', '', 'g') = '0503405283'
     );
UPDATE families SET parent_name = COALESCE('לינה', parent_name)
     WHERE regexp_replace(phone, '[^0-9]', '', 'g') = '0528655365';
INSERT INTO families (phone, parent_name)
     SELECT '052-8655365', 'לינה'
     WHERE NOT EXISTS (
       SELECT 1 FROM families WHERE regexp_replace(phone, '[^0-9]', '', 'g') = '0528655365'
     );
UPDATE families SET parent_name = COALESCE('שני', parent_name)
     WHERE regexp_replace(phone, '[^0-9]', '', 'g') = '0545808153';
INSERT INTO families (phone, parent_name)
     SELECT '054-5808153', 'שני'
     WHERE NOT EXISTS (
       SELECT 1 FROM families WHERE regexp_replace(phone, '[^0-9]', '', 'g') = '0545808153'
     );
UPDATE families SET parent_name = COALESCE('מורן', parent_name)
     WHERE regexp_replace(phone, '[^0-9]', '', 'g') = '0544598020';
INSERT INTO families (phone, parent_name)
     SELECT '054-4598020', 'מורן'
     WHERE NOT EXISTS (
       SELECT 1 FROM families WHERE regexp_replace(phone, '[^0-9]', '', 'g') = '0544598020'
     );
UPDATE families SET parent_name = COALESCE('ברטי', parent_name)
     WHERE regexp_replace(phone, '[^0-9]', '', 'g') = '0544548505';
INSERT INTO families (phone, parent_name)
     SELECT '054-4548505', 'ברטי'
     WHERE NOT EXISTS (
       SELECT 1 FROM families WHERE regexp_replace(phone, '[^0-9]', '', 'g') = '0544548505'
     );
UPDATE families SET parent_name = COALESCE('מני', parent_name)
     WHERE regexp_replace(phone, '[^0-9]', '', 'g') = '0522441910';
INSERT INTO families (phone, parent_name)
     SELECT '052-2441910', 'מני'
     WHERE NOT EXISTS (
       SELECT 1 FROM families WHERE regexp_replace(phone, '[^0-9]', '', 'g') = '0522441910'
     );
UPDATE families SET parent_name = COALESCE('נועה', parent_name)
     WHERE regexp_replace(phone, '[^0-9]', '', 'g') = '0545602952';
INSERT INTO families (phone, parent_name)
     SELECT '054-5602952', 'נועה'
     WHERE NOT EXISTS (
       SELECT 1 FROM families WHERE regexp_replace(phone, '[^0-9]', '', 'g') = '0545602952'
     );
UPDATE families SET parent_name = COALESCE('גיא', parent_name)
     WHERE regexp_replace(phone, '[^0-9]', '', 'g') = '0506066778';
INSERT INTO families (phone, parent_name)
     SELECT '050-6066778', 'גיא'
     WHERE NOT EXISTS (
       SELECT 1 FROM families WHERE regexp_replace(phone, '[^0-9]', '', 'g') = '0506066778'
     );
UPDATE families SET parent_name = COALESCE('ספיר', parent_name)
     WHERE regexp_replace(phone, '[^0-9]', '', 'g') = '0555048874';
INSERT INTO families (phone, parent_name)
     SELECT '055-5048874', 'ספיר'
     WHERE NOT EXISTS (
       SELECT 1 FROM families WHERE regexp_replace(phone, '[^0-9]', '', 'g') = '0555048874'
     );
UPDATE families SET parent_name = COALESCE('איירין', parent_name)
     WHERE regexp_replace(phone, '[^0-9]', '', 'g') = '0545432991';
INSERT INTO families (phone, parent_name)
     SELECT '054-5432991', 'איירין'
     WHERE NOT EXISTS (
       SELECT 1 FROM families WHERE regexp_replace(phone, '[^0-9]', '', 'g') = '0545432991'
     );
UPDATE families SET parent_name = COALESCE('ענבל', parent_name)
     WHERE regexp_replace(phone, '[^0-9]', '', 'g') = '0528610353';
INSERT INTO families (phone, parent_name)
     SELECT '052-8610353', 'ענבל'
     WHERE NOT EXISTS (
       SELECT 1 FROM families WHERE regexp_replace(phone, '[^0-9]', '', 'g') = '0528610353'
     );
UPDATE families SET parent_name = COALESCE('תהילה', parent_name)
     WHERE regexp_replace(phone, '[^0-9]', '', 'g') = '0528531938';
INSERT INTO families (phone, parent_name)
     SELECT '052-8531938', 'תהילה'
     WHERE NOT EXISTS (
       SELECT 1 FROM families WHERE regexp_replace(phone, '[^0-9]', '', 'g') = '0528531938'
     );
INSERT INTO participants (id, family_id, full_name, gender, external_client_id)
         SELECT 'b92f755c-1c25-4f1f-8849-b749589ee5ba', f.id, 'צביה נוי', 'female', '87311819'
         FROM families f
         WHERE regexp_replace(f.phone, '[^0-9]', '', 'g') = '0526768272';
INSERT INTO participants (id, family_id, full_name, gender, external_client_id)
         SELECT '827bb367-5aa7-4a99-aa90-864da3a03b99', f.id, 'הראל גניש', 'male', '87310998'
         FROM families f
         WHERE regexp_replace(f.phone, '[^0-9]', '', 'g') = '0507475771';
INSERT INTO participants (id, family_id, full_name, gender, external_client_id)
         SELECT 'df132ab1-2600-446a-afa2-4d34e9abeed1', f.id, 'ארין עטייה', 'female', '87311823'
         FROM families f
         WHERE regexp_replace(f.phone, '[^0-9]', '', 'g') = '0542616000';
INSERT INTO participants (id, family_id, full_name, gender, external_client_id)
         SELECT 'bc00cd6b-da9f-42e7-9152-c98283a470a3', f.id, 'תמיר קזנין', 'male', '87310221'
         FROM families f
         WHERE regexp_replace(f.phone, '[^0-9]', '', 'g') = '0546546610';
INSERT INTO participants (id, family_id, full_name, gender, external_client_id)
         SELECT 'c63f7a89-6d1c-4ef1-ba3e-af4c2ebbfeed', f.id, 'ליאם אגייב', 'male', '87311867'
         FROM families f
         WHERE regexp_replace(f.phone, '[^0-9]', '', 'g') = '0523207077';
INSERT INTO participants (id, family_id, full_name, gender, external_client_id)
         SELECT 'b8cbda5c-850d-4a2a-b474-12a4b269808b', f.id, 'רני שאנן', 'male', '87309439'
         FROM families f
         WHERE regexp_replace(f.phone, '[^0-9]', '', 'g') = '0503405283';
INSERT INTO participants (id, family_id, full_name, gender, external_client_id)
         SELECT 'aa599e50-25e9-453a-8251-ee829fab3102', f.id, 'איתן גריגוריאן', 'male', '87311869'
         FROM families f
         WHERE regexp_replace(f.phone, '[^0-9]', '', 'g') = '0528655365';
INSERT INTO participants (id, family_id, full_name, gender, external_client_id)
         SELECT '1cbad619-1cf6-4222-b425-8943cd952381', f.id, 'גאיה גולדשטיין', 'female', '87311821'
         FROM families f
         WHERE regexp_replace(f.phone, '[^0-9]', '', 'g') = '0545808153';
INSERT INTO participants (id, family_id, full_name, gender, external_client_id)
         SELECT 'd2b25590-f2a0-44b5-99e8-10bb38fd0211', f.id, 'יובל גולדשטיין', 'female', '87311822'
         FROM families f
         WHERE regexp_replace(f.phone, '[^0-9]', '', 'g') = '0545808153';
INSERT INTO participants (id, family_id, full_name, gender, external_client_id)
         SELECT '30b8d90b-f7ac-4fc0-9020-32a0110ee4a0', f.id, 'נעמי מור', 'female', '87311868'
         FROM families f
         WHERE regexp_replace(f.phone, '[^0-9]', '', 'g') = '0544598020';
INSERT INTO participants (id, family_id, full_name, gender, external_client_id)
         SELECT 'f3367cad-fdac-4d58-9a61-e28e4435490a', f.id, 'מאור קטן', 'male', '87311815'
         FROM families f
         WHERE regexp_replace(f.phone, '[^0-9]', '', 'g') = '0544548505';
INSERT INTO participants (id, family_id, full_name, gender, external_client_id)
         SELECT '553f0288-18f2-4a8e-ae83-b2bca0561f0b', f.id, 'איתמר דאלי', 'male', '87311818'
         FROM families f
         WHERE regexp_replace(f.phone, '[^0-9]', '', 'g') = '0522441910';
INSERT INTO participants (id, family_id, full_name, gender, external_client_id)
         SELECT '52f6e96e-fd50-4ba3-a85f-2489a8eda1c7', f.id, 'אור קזס', 'female', '87311817'
         FROM families f
         WHERE regexp_replace(f.phone, '[^0-9]', '', 'g') = '0545602952';
INSERT INTO participants (id, family_id, full_name, gender, external_client_id)
         SELECT '184cdf8e-b66d-43f1-bcc5-dd83c5d88d7f', f.id, 'אורי יום טוב', 'female', '87311836'
         FROM families f
         WHERE regexp_replace(f.phone, '[^0-9]', '', 'g') = '0506066778';
INSERT INTO participants (id, family_id, full_name, gender, external_client_id)
         SELECT '6839ab6d-8467-4f33-9f5e-abb177c67662', f.id, 'מבל משה', 'female', '87311856'
         FROM families f
         WHERE regexp_replace(f.phone, '[^0-9]', '', 'g') = '0555048874';
INSERT INTO participants (id, family_id, full_name, gender, external_client_id)
         SELECT '8a5d4ead-fea8-40f7-b5ea-b987f3fb4f0d', f.id, 'ינאי דוחובני', 'male', '87309756'
         FROM families f
         WHERE regexp_replace(f.phone, '[^0-9]', '', 'g') = '0545432991';
INSERT INTO participants (id, family_id, full_name, gender, external_client_id)
         SELECT '1be436fc-867f-4e05-a3f3-3b11d2347adb', f.id, 'עדי עיון', 'female', '87311972'
         FROM families f
         WHERE regexp_replace(f.phone, '[^0-9]', '', 'g') = '0528610353';
INSERT INTO participants (id, family_id, full_name, gender, external_client_id)
         SELECT 'c248dfb0-717e-4783-bbe4-26a05de0003c', f.id, 'ארד שר', 'male', NULL
         FROM families f
         WHERE regexp_replace(f.phone, '[^0-9]', '', 'g') = '0528531938';
INSERT INTO enrollments (product_id, participant_id, payment_status, valid_from, valid_until, active)
     VALUES ('b8efb38e-e674-425a-afc7-cdf67d37c32b', 'b92f755c-1c25-4f1f-8849-b749589ee5ba', 'paid', '2026-05-25', '2026-07-02', true);
INSERT INTO enrollments (product_id, participant_id, payment_status, valid_from, valid_until, active)
     VALUES ('b8efb38e-e674-425a-afc7-cdf67d37c32b', '827bb367-5aa7-4a99-aa90-864da3a03b99', 'paid', '2026-05-25', '2026-07-02', true);
INSERT INTO enrollments (product_id, participant_id, payment_status, valid_from, valid_until, active)
     VALUES ('b8efb38e-e674-425a-afc7-cdf67d37c32b', 'df132ab1-2600-446a-afa2-4d34e9abeed1', 'paid', '2026-05-25', '2026-07-02', true);
INSERT INTO enrollments (product_id, participant_id, payment_status, valid_from, valid_until, active)
     VALUES ('b8efb38e-e674-425a-afc7-cdf67d37c32b', 'bc00cd6b-da9f-42e7-9152-c98283a470a3', 'paid', '2026-05-25', '2026-07-02', true);
INSERT INTO enrollments (product_id, participant_id, payment_status, valid_from, valid_until, active)
     VALUES ('0da52bcf-ed63-4628-bf10-81ef86be87ca', 'c63f7a89-6d1c-4ef1-ba3e-af4c2ebbfeed', 'paid', '2026-05-26', '2026-07-03', true);
INSERT INTO enrollments (product_id, participant_id, payment_status, valid_from, valid_until, active)
     VALUES ('0da52bcf-ed63-4628-bf10-81ef86be87ca', 'b8cbda5c-850d-4a2a-b474-12a4b269808b', 'paid', '2026-05-26', '2026-07-03', true);
INSERT INTO enrollments (product_id, participant_id, payment_status, valid_from, valid_until, active)
     VALUES ('0da52bcf-ed63-4628-bf10-81ef86be87ca', 'aa599e50-25e9-453a-8251-ee829fab3102', 'paid', '2026-05-26', '2026-07-03', true);
INSERT INTO enrollments (product_id, participant_id, payment_status, valid_from, valid_until, active)
     VALUES ('0da52bcf-ed63-4628-bf10-81ef86be87ca', '1cbad619-1cf6-4222-b425-8943cd952381', 'paid', '2026-05-26', '2026-07-03', true);
INSERT INTO enrollments (product_id, participant_id, payment_status, valid_from, valid_until, active)
     VALUES ('0da52bcf-ed63-4628-bf10-81ef86be87ca', 'd2b25590-f2a0-44b5-99e8-10bb38fd0211', 'paid', '2026-05-26', '2026-07-03', true);
INSERT INTO enrollments (product_id, participant_id, payment_status, valid_from, valid_until, active)
     VALUES ('0da52bcf-ed63-4628-bf10-81ef86be87ca', '30b8d90b-f7ac-4fc0-9020-32a0110ee4a0', 'paid', '2026-05-26', '2026-07-03', true);
INSERT INTO enrollments (product_id, participant_id, payment_status, valid_from, valid_until, active)
     VALUES ('22488a65-8387-4b50-9277-71f875cff7ed', 'f3367cad-fdac-4d58-9a61-e28e4435490a', 'paid', '2026-05-26', '2026-07-03', true);
INSERT INTO enrollments (product_id, participant_id, payment_status, valid_from, valid_until, active)
     VALUES ('22488a65-8387-4b50-9277-71f875cff7ed', '553f0288-18f2-4a8e-ae83-b2bca0561f0b', 'paid', '2026-05-26', '2026-07-03', true);
INSERT INTO enrollments (product_id, participant_id, payment_status, valid_from, valid_until, active)
     VALUES ('22488a65-8387-4b50-9277-71f875cff7ed', '52f6e96e-fd50-4ba3-a85f-2489a8eda1c7', 'paid', '2026-05-26', '2026-07-03', true);
INSERT INTO enrollments (product_id, participant_id, payment_status, valid_from, valid_until, active)
     VALUES ('22488a65-8387-4b50-9277-71f875cff7ed', '184cdf8e-b66d-43f1-bcc5-dd83c5d88d7f', 'paid', '2026-05-26', '2026-07-03', true);
INSERT INTO enrollments (product_id, participant_id, payment_status, valid_from, valid_until, active)
     VALUES ('22488a65-8387-4b50-9277-71f875cff7ed', '6839ab6d-8467-4f33-9f5e-abb177c67662', 'paid', '2026-05-26', '2026-07-03', true);
INSERT INTO enrollments (product_id, participant_id, payment_status, valid_from, valid_until, active)
     VALUES ('22488a65-8387-4b50-9277-71f875cff7ed', '8a5d4ead-fea8-40f7-b5ea-b987f3fb4f0d', 'paid', '2026-05-26', '2026-07-03', true);
INSERT INTO enrollments (product_id, participant_id, payment_status, valid_from, valid_until, active)
     VALUES ('e59285ab-93f7-4185-b4b9-0e5d3b5ef1e1', '1be436fc-867f-4e05-a3f3-3b11d2347adb', 'paid', '2026-05-25', '2026-07-02', true);
INSERT INTO enrollments (product_id, participant_id, payment_status, valid_from, valid_until, active)
     VALUES ('e59285ab-93f7-4185-b4b9-0e5d3b5ef1e1', 'c248dfb0-717e-4783-bbe4-26a05de0003c', 'paid', '2026-05-25', '2026-07-02', true);
INSERT INTO sheet_sync_runs (direction, sheet_tab, status, rows_in, finished_at)
   VALUES ('pull', 'summer_resync', 'ok', 18, NOW());
COMMIT;
-- season_id: 78cc8b68-f22e-4d7b-98e8-3b48118b0283
-- report: {"products":15,"enrollments_existing":0,"enrollments_new_participant":18,"enrollments_unmatched":[],"unmatched_products":[]}