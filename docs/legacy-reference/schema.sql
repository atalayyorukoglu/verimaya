--
-- PostgreSQL database dump
--


-- Dumped from database version 16.13
-- Dumped by pg_dump version 18.3

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: pg_trgm; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;


--
-- Name: EXTENSION pg_trgm; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pg_trgm IS 'text similarity measurement and index searching based on trigrams';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: alembic_version; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.alembic_version (
    version_num character varying(32) NOT NULL
);


--
-- Name: appointment_checklist_progress; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.appointment_checklist_progress (
    appointment_id uuid NOT NULL,
    template_id uuid NOT NULL,
    done boolean DEFAULT false NOT NULL
);


--
-- Name: appointment_checklist_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.appointment_checklist_templates (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    label character varying(255) NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: appointment_statuses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.appointment_statuses (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    name character varying(80) NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: appointment_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.appointment_types (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    name character varying(120) NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: appointments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.appointments (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    case_id uuid,
    starts_at timestamp with time zone NOT NULL,
    ends_at timestamp with time zone,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    contact_id uuid,
    appointment_type_id uuid,
    appointment_status_id uuid,
    clinic_contact_id uuid,
    hotel_contact_id uuid,
    transfer_contact_id uuid,
    clinic_note text,
    hotel_note text,
    transfer_note text
);


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    actor_user_id uuid,
    actor_email character varying(255),
    action character varying(128) NOT NULL,
    entity_type character varying(64),
    entity_id character varying(64),
    summary character varying(255),
    before jsonb,
    after jsonb,
    meta jsonb,
    request_id character varying(128),
    user_agent text,
    ip character varying(64),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: case_files; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.case_files (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    case_id uuid,
    filename character varying(512) NOT NULL,
    drive_file_id character varying(128) NOT NULL,
    drive_web_link text DEFAULT ''::text NOT NULL,
    mime_type character varying(256) DEFAULT ''::character varying NOT NULL,
    uploaded_at timestamp with time zone DEFAULT now() NOT NULL,
    appointment_id uuid
);


--
-- Name: cases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cases (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    full_name character varying(255) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    phone character varying(64),
    notes text,
    extra jsonb,
    contact_id uuid
);


--
-- Name: contact_note_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contact_note_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    contact_id uuid NOT NULL,
    author_user_id uuid,
    author_display_name character varying(255) NOT NULL,
    body text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: contact_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contact_types (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    name character varying(80) NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contacts (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    contact_type_id uuid NOT NULL,
    first_name character varying(120) NOT NULL,
    last_name character varying(120) NOT NULL,
    email character varying(255),
    phone character varying(64),
    extra jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    notes text,
    is_internal boolean DEFAULT false NOT NULL
);


--
-- Name: finance_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.finance_categories (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    name character varying(255) NOT NULL,
    kind character varying(16) NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: finance_subcategories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.finance_subcategories (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    category_id uuid NOT NULL,
    name character varying(255) NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: inbound_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inbound_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    waha_message_id character varying(255) NOT NULL,
    chat_name character varying(255),
    sender character varying(255),
    body text,
    has_media boolean DEFAULT false NOT NULL,
    media_path character varying(1024),
    status character varying(32) DEFAULT 'new'::character varying NOT NULL,
    raw jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    parsed_records jsonb,
    parse_error text
);


--
-- Name: memberships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.memberships (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    role character varying(64) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tenants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenants (
    id uuid NOT NULL,
    name character varying(255) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    cases_section_label character varying(80) DEFAULT 'Hastalar'::character varying NOT NULL,
    permissions jsonb,
    base_currency character varying(8) DEFAULT 'GBP'::character varying NOT NULL,
    appt_type_defaults_seeded boolean NOT NULL,
    appt_status_defaults_seeded boolean NOT NULL,
    appt_checklist_defaults_seeded boolean NOT NULL,
    finance_category_defaults_seeded boolean NOT NULL,
    ai_transaction_prompt text
);


--
-- Name: transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transactions (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    kind character varying(16) NOT NULL,
    title character varying(255) NOT NULL,
    subtitle character varying(255),
    category character varying(128),
    occurred_on date NOT NULL,
    status character varying(32) NOT NULL,
    payment_method character varying(64),
    amount numeric(14,2) NOT NULL,
    counterparty_amount numeric(14,2),
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    case_id uuid,
    service_tag character varying(128),
    currency character varying(8) DEFAULT 'TRY'::character varying NOT NULL,
    equivalent_currency character varying(8),
    responsible_party character varying(128),
    contact_label character varying(255),
    contact_id uuid,
    invoice_status character varying(32) DEFAULT 'none'::character varying NOT NULL,
    paid_amount numeric(14,2),
    responsible_contact_id uuid,
    payer_contact_id uuid,
    payee_contact_id uuid
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid NOT NULL,
    email character varying(255) NOT NULL,
    display_name character varying(255) NOT NULL,
    password_hash character varying(255),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    refresh_token_version integer DEFAULT 0 NOT NULL
);


--
-- Name: whatsapp_corrections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.whatsapp_corrections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    transaction_id uuid,
    field_name character varying(64) NOT NULL,
    ai_value text,
    user_value text,
    original_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: alembic_version alembic_version_pkc; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alembic_version
    ADD CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num);


--
-- Name: appointment_checklist_progress appointment_checklist_progress_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointment_checklist_progress
    ADD CONSTRAINT appointment_checklist_progress_pkey PRIMARY KEY (appointment_id, template_id);


--
-- Name: appointment_checklist_templates appointment_checklist_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointment_checklist_templates
    ADD CONSTRAINT appointment_checklist_templates_pkey PRIMARY KEY (id);


--
-- Name: appointment_statuses appointment_statuses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointment_statuses
    ADD CONSTRAINT appointment_statuses_pkey PRIMARY KEY (id);


--
-- Name: appointment_types appointment_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointment_types
    ADD CONSTRAINT appointment_types_pkey PRIMARY KEY (id);


--
-- Name: appointments appointments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointments
    ADD CONSTRAINT appointments_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: case_files case_files_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.case_files
    ADD CONSTRAINT case_files_pkey PRIMARY KEY (id);


--
-- Name: contact_note_messages contact_note_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_note_messages
    ADD CONSTRAINT contact_note_messages_pkey PRIMARY KEY (id);


--
-- Name: finance_categories finance_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_categories
    ADD CONSTRAINT finance_categories_pkey PRIMARY KEY (id);


--
-- Name: finance_subcategories finance_subcategories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_subcategories
    ADD CONSTRAINT finance_subcategories_pkey PRIMARY KEY (id);


--
-- Name: inbound_messages inbound_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inbound_messages
    ADD CONSTRAINT inbound_messages_pkey PRIMARY KEY (id);


--
-- Name: memberships memberships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.memberships
    ADD CONSTRAINT memberships_pkey PRIMARY KEY (id);


--
-- Name: contacts parties_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT parties_pkey PRIMARY KEY (id);


--
-- Name: contact_types party_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_types
    ADD CONSTRAINT party_types_pkey PRIMARY KEY (id);


--
-- Name: cases patients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cases
    ADD CONSTRAINT patients_pkey PRIMARY KEY (id);


--
-- Name: tenants tenants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_pkey PRIMARY KEY (id);


--
-- Name: transactions transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_pkey PRIMARY KEY (id);


--
-- Name: inbound_messages uq_inbound_messages_waha_message_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inbound_messages
    ADD CONSTRAINT uq_inbound_messages_waha_message_id UNIQUE (waha_message_id);


--
-- Name: memberships uq_membership_user_tenant; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.memberships
    ADD CONSTRAINT uq_membership_user_tenant UNIQUE (user_id, tenant_id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: whatsapp_corrections whatsapp_corrections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_corrections
    ADD CONSTRAINT whatsapp_corrections_pkey PRIMARY KEY (id);


--
-- Name: ix_appointment_checklist_templates_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_appointment_checklist_templates_tenant_id ON public.appointment_checklist_templates USING btree (tenant_id);


--
-- Name: ix_appointment_statuses_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_appointment_statuses_tenant_id ON public.appointment_statuses USING btree (tenant_id);


--
-- Name: ix_appointment_types_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_appointment_types_tenant_id ON public.appointment_types USING btree (tenant_id);


--
-- Name: ix_appointments_case_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_appointments_case_id ON public.appointments USING btree (case_id);


--
-- Name: ix_appointments_contact_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_appointments_contact_id ON public.appointments USING btree (contact_id);


--
-- Name: ix_appointments_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_appointments_tenant_id ON public.appointments USING btree (tenant_id);


--
-- Name: ix_appointments_tenant_starts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_appointments_tenant_starts ON public.appointments USING btree (tenant_id, starts_at);


--
-- Name: ix_audit_logs_action; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_audit_logs_action ON public.audit_logs USING btree (action);


--
-- Name: ix_audit_logs_actor_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_audit_logs_actor_user_id ON public.audit_logs USING btree (actor_user_id);


--
-- Name: ix_audit_logs_entity_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_audit_logs_entity_id ON public.audit_logs USING btree (entity_id);


--
-- Name: ix_audit_logs_entity_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_audit_logs_entity_type ON public.audit_logs USING btree (entity_type);


--
-- Name: ix_audit_logs_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_audit_logs_tenant_id ON public.audit_logs USING btree (tenant_id);


--
-- Name: ix_case_files_appointment_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_case_files_appointment_id ON public.case_files USING btree (appointment_id);


--
-- Name: ix_case_files_case_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_case_files_case_id ON public.case_files USING btree (case_id);


--
-- Name: ix_case_files_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_case_files_tenant_id ON public.case_files USING btree (tenant_id);


--
-- Name: ix_cases_contact_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_cases_contact_id ON public.cases USING btree (contact_id);


--
-- Name: ix_cases_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_cases_tenant_id ON public.cases USING btree (tenant_id);


--
-- Name: ix_cnm_contact_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_cnm_contact_created ON public.contact_note_messages USING btree (contact_id, created_at);


--
-- Name: ix_contact_note_messages_contact_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_contact_note_messages_contact_id ON public.contact_note_messages USING btree (contact_id);


--
-- Name: ix_contact_note_messages_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_contact_note_messages_tenant_id ON public.contact_note_messages USING btree (tenant_id);


--
-- Name: ix_contact_types_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_contact_types_tenant_id ON public.contact_types USING btree (tenant_id);


--
-- Name: ix_contacts_contact_type_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_contacts_contact_type_id ON public.contacts USING btree (contact_type_id);


--
-- Name: ix_contacts_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_contacts_tenant_id ON public.contacts USING btree (tenant_id);


--
-- Name: ix_finance_categories_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_finance_categories_tenant_id ON public.finance_categories USING btree (tenant_id);


--
-- Name: ix_finance_categories_tenant_sort; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_finance_categories_tenant_sort ON public.finance_categories USING btree (tenant_id, sort_order);


--
-- Name: ix_finance_subcategories_cat_sort; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_finance_subcategories_cat_sort ON public.finance_subcategories USING btree (category_id, sort_order);


--
-- Name: ix_finance_subcategories_category_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_finance_subcategories_category_id ON public.finance_subcategories USING btree (category_id);


--
-- Name: ix_finance_subcategories_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_finance_subcategories_tenant_id ON public.finance_subcategories USING btree (tenant_id);


--
-- Name: ix_inbound_messages_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_inbound_messages_status ON public.inbound_messages USING btree (status);


--
-- Name: ix_inbound_messages_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_inbound_messages_tenant_id ON public.inbound_messages USING btree (tenant_id);


--
-- Name: ix_memberships_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_memberships_tenant_id ON public.memberships USING btree (tenant_id);


--
-- Name: ix_memberships_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_memberships_user_id ON public.memberships USING btree (user_id);


--
-- Name: ix_transactions_case_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_transactions_case_id ON public.transactions USING btree (case_id);


--
-- Name: ix_transactions_contact_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_transactions_contact_id ON public.transactions USING btree (contact_id);


--
-- Name: ix_transactions_payee_contact_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_transactions_payee_contact_id ON public.transactions USING btree (payee_contact_id);


--
-- Name: ix_transactions_payer_contact_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_transactions_payer_contact_id ON public.transactions USING btree (payer_contact_id);


--
-- Name: ix_transactions_responsible_contact_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_transactions_responsible_contact_id ON public.transactions USING btree (responsible_contact_id);


--
-- Name: ix_transactions_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_transactions_tenant_id ON public.transactions USING btree (tenant_id);


--
-- Name: ix_transactions_tenant_occurred; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_transactions_tenant_occurred ON public.transactions USING btree (tenant_id, occurred_on);


--
-- Name: ix_trgm_contacts_first_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_trgm_contacts_first_name ON public.contacts USING gin (first_name public.gin_trgm_ops);


--
-- Name: ix_trgm_contacts_last_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_trgm_contacts_last_name ON public.contacts USING gin (last_name public.gin_trgm_ops);


--
-- Name: ix_trgm_transactions_contact_label; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_trgm_transactions_contact_label ON public.transactions USING gin (contact_label public.gin_trgm_ops);


--
-- Name: ix_trgm_transactions_description; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_trgm_transactions_description ON public.transactions USING gin (description public.gin_trgm_ops);


--
-- Name: ix_trgm_transactions_responsible_party; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_trgm_transactions_responsible_party ON public.transactions USING gin (responsible_party public.gin_trgm_ops);


--
-- Name: ix_trgm_transactions_service_tag; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_trgm_transactions_service_tag ON public.transactions USING gin (service_tag public.gin_trgm_ops);


--
-- Name: ix_trgm_transactions_subtitle; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_trgm_transactions_subtitle ON public.transactions USING gin (subtitle public.gin_trgm_ops);


--
-- Name: ix_trgm_transactions_title; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_trgm_transactions_title ON public.transactions USING gin (title public.gin_trgm_ops);


--
-- Name: ix_users_email; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ix_users_email ON public.users USING btree (email);


--
-- Name: ix_whatsapp_corrections_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_whatsapp_corrections_tenant_id ON public.whatsapp_corrections USING btree (tenant_id);


--
-- Name: uq_contact_types_tenant_id_name; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_contact_types_tenant_id_name ON public.contact_types USING btree (tenant_id, name);


--
-- Name: appointment_checklist_progress appointment_checklist_progress_appointment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointment_checklist_progress
    ADD CONSTRAINT appointment_checklist_progress_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES public.appointments(id) ON DELETE CASCADE;


--
-- Name: appointment_checklist_progress appointment_checklist_progress_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointment_checklist_progress
    ADD CONSTRAINT appointment_checklist_progress_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.appointment_checklist_templates(id) ON DELETE CASCADE;


--
-- Name: appointment_checklist_templates appointment_checklist_templates_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointment_checklist_templates
    ADD CONSTRAINT appointment_checklist_templates_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: appointment_statuses appointment_statuses_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointment_statuses
    ADD CONSTRAINT appointment_statuses_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: appointment_types appointment_types_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointment_types
    ADD CONSTRAINT appointment_types_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: appointments appointments_case_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointments
    ADD CONSTRAINT appointments_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.cases(id) ON DELETE SET NULL;


--
-- Name: appointments appointments_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointments
    ADD CONSTRAINT appointments_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: audit_logs audit_logs_actor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: audit_logs audit_logs_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: case_files case_files_appointment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.case_files
    ADD CONSTRAINT case_files_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES public.appointments(id) ON DELETE SET NULL;


--
-- Name: case_files case_files_case_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.case_files
    ADD CONSTRAINT case_files_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.cases(id) ON DELETE CASCADE;


--
-- Name: case_files case_files_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.case_files
    ADD CONSTRAINT case_files_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: contact_note_messages contact_note_messages_author_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_note_messages
    ADD CONSTRAINT contact_note_messages_author_user_id_fkey FOREIGN KEY (author_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: contact_note_messages contact_note_messages_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_note_messages
    ADD CONSTRAINT contact_note_messages_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;


--
-- Name: contact_note_messages contact_note_messages_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_note_messages
    ADD CONSTRAINT contact_note_messages_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: contacts contacts_contact_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_contact_type_id_fkey FOREIGN KEY (contact_type_id) REFERENCES public.contact_types(id) ON DELETE RESTRICT;


--
-- Name: finance_categories finance_categories_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_categories
    ADD CONSTRAINT finance_categories_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: finance_subcategories finance_subcategories_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_subcategories
    ADD CONSTRAINT finance_subcategories_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.finance_categories(id) ON DELETE CASCADE;


--
-- Name: finance_subcategories finance_subcategories_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_subcategories
    ADD CONSTRAINT finance_subcategories_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: appointments fk_appointments_appointment_status_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointments
    ADD CONSTRAINT fk_appointments_appointment_status_id FOREIGN KEY (appointment_status_id) REFERENCES public.appointment_statuses(id) ON DELETE SET NULL;


--
-- Name: appointments fk_appointments_appointment_type_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointments
    ADD CONSTRAINT fk_appointments_appointment_type_id FOREIGN KEY (appointment_type_id) REFERENCES public.appointment_types(id) ON DELETE SET NULL;


--
-- Name: appointments fk_appointments_clinic_contact_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointments
    ADD CONSTRAINT fk_appointments_clinic_contact_id FOREIGN KEY (clinic_contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;


--
-- Name: appointments fk_appointments_contact_id_contacts; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointments
    ADD CONSTRAINT fk_appointments_contact_id_contacts FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;


--
-- Name: appointments fk_appointments_hotel_contact_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointments
    ADD CONSTRAINT fk_appointments_hotel_contact_id FOREIGN KEY (hotel_contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;


--
-- Name: appointments fk_appointments_transfer_contact_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointments
    ADD CONSTRAINT fk_appointments_transfer_contact_id FOREIGN KEY (transfer_contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;


--
-- Name: cases fk_cases_contact_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cases
    ADD CONSTRAINT fk_cases_contact_id FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;


--
-- Name: transactions fk_transactions_case_id_cases; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT fk_transactions_case_id_cases FOREIGN KEY (case_id) REFERENCES public.cases(id) ON DELETE SET NULL;


--
-- Name: transactions fk_transactions_contact_id_contacts; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT fk_transactions_contact_id_contacts FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;


--
-- Name: transactions fk_transactions_payee_contact_id_contacts; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT fk_transactions_payee_contact_id_contacts FOREIGN KEY (payee_contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;


--
-- Name: transactions fk_transactions_payer_contact_id_contacts; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT fk_transactions_payer_contact_id_contacts FOREIGN KEY (payer_contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;


--
-- Name: transactions fk_transactions_responsible_contact_id_contacts; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT fk_transactions_responsible_contact_id_contacts FOREIGN KEY (responsible_contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;


--
-- Name: inbound_messages inbound_messages_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inbound_messages
    ADD CONSTRAINT inbound_messages_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: memberships memberships_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.memberships
    ADD CONSTRAINT memberships_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: memberships memberships_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.memberships
    ADD CONSTRAINT memberships_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: contacts parties_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT parties_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: contact_types party_types_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_types
    ADD CONSTRAINT party_types_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: cases patients_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cases
    ADD CONSTRAINT patients_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: transactions transactions_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: whatsapp_corrections whatsapp_corrections_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_corrections
    ADD CONSTRAINT whatsapp_corrections_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: whatsapp_corrections whatsapp_corrections_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_corrections
    ADD CONSTRAINT whatsapp_corrections_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES public.transactions(id) ON DELETE SET NULL;


--
-- PostgreSQL database dump complete
--

\unrestrict RtLb2utfSanSdGcbEa6EGnU1apOqAu6b0BbX8xQz6VuC2ZfcKylYeFbyabIOPTz

