-- Tabela odbiorców mailingu zarządzana z panelu (CRUD).
-- Zakres: tylko lista; nie jest jeszcze podłączona do wysyłki digestu.

CREATE TABLE mailing_recipients (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  email      text        NOT NULL UNIQUE,
  name       text,
  status     text        NOT NULL DEFAULT 'active'
             CHECK (status IN ('active', 'unsubscribed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE mailing_recipients ENABLE ROW LEVEL SECURITY;

-- RLS policy design — RÓŻNI SIĘ od articles_seen celowo:
--   articles_seen: zapisy idą wyłącznie przez service_role (skrypty), więc INSERT/UPDATE/DELETE
--                  nie mają jawnych polityk (service_role pomija RLS).
--   mailing_recipients: cały CRUD idzie z aplikacji webowej, która działa jako rola
--                  'authenticated' na kluczu anon (SUPABASE_KEY). Dlatego INSERT/UPDATE/DELETE
--                  MUSZĄ mieć jawne polityki dla 'authenticated' — bez nich zapisy z UI
--                  cicho nie przejdą. Rola 'anon' (niezalogowani) jest zablokowana domyślnie.
CREATE POLICY "authenticated can select"
  ON mailing_recipients FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated can insert"
  ON mailing_recipients FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated can update"
  ON mailing_recipients FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated can delete"
  ON mailing_recipients FOR DELETE TO authenticated USING (true);
