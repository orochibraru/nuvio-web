<script lang="ts">
	import AlertCircleIcon from "@lucide/svelte/icons/alert-circle";
	import CheckCircleIcon from "@lucide/svelte/icons/check-circle-2";
	import LockIcon from "@lucide/svelte/icons/lock";
	import TrashIcon from "@lucide/svelte/icons/trash-2";
	import type { AllowlistEntry } from "#lib/admin/admin-data.js";
	import * as Alert from "#lib/components/ui/alert/index.js";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Card from "#lib/components/ui/card/index.js";
	import * as Field from "#lib/components/ui/field/index.js";
	import { Input } from "#lib/components/ui/input/index.js";
	import { getLocale, m } from "#lib/i18n/index.js";
	import {
		type MailFailure,
		SMTP_SECURITY,
		type SmtpSecurity,
		type SmtpSettingsView,
	} from "#lib/notifications/smtp.js";
	import {
		allowEmail,
		revokeEmail,
		saveSmtpSettings,
		sendTestEmail,
		setInstanceLock,
	} from "./admin.remote.ts";

	let {
		locked,
		allowlist,
		admins,
		smtp,
		smtpReady,
	}: {
		locked: boolean;
		allowlist: AllowlistEntry[];
		admins: string[];
		smtp: SmtpSettingsView | null;
		smtpReady: boolean;
	} = $props();

	const allowIssue = $derived(allowEmail.fields.email.issues()?.[0]?.message);
	const dateTime = $derived(
		new Intl.DateTimeFormat(getLocale(), {
			dateStyle: "medium",
			timeStyle: "short",
		}),
	);

	const securityLabels: Record<SmtpSecurity, () => string> = {
		none: m.admin_smtp_security_none,
		starttls: m.admin_smtp_security_starttls,
		tls: m.admin_smtp_security_tls,
	};
	const failureMessages: Record<MailFailure, () => string> = {
		not_configured: m.admin_smtp_test_not_configured,
		auth: m.admin_smtp_test_auth,
		connection: m.admin_smtp_test_connection,
		timeout: m.admin_smtp_test_timeout,
		rejected: m.admin_smtp_test_rejected,
		unknown: m.admin_smtp_test_unknown,
	};

	function issue(field: {
		issues: () => { message: string }[] | undefined;
	}): string | undefined {
		return field.issues()?.[0]?.message;
	}

	const fields = saveSmtpSettings.fields;
	const testResult = $derived(sendTestEmail.result);
</script>

<div class="grid grid-cols-1 gap-6 xl:grid-cols-2">
  <Card.Root class="border border-foreground/10">
    <Card.Header>
      <Card.Title>{m.admin_access()}</Card.Title>
      <Card.Description>
        {m.admin_access_description()}
      </Card.Description>
    </Card.Header>
    <Card.Content class="flex flex-col gap-6">
      <div
        class="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-foreground/10 p-4"
      >
        <span class="flex flex-col gap-0.5">
          <span class="flex items-center gap-2 text-sm font-medium">
            <LockIcon class="size-4" />
            {locked ? m.admin_locked() : m.admin_open()}
          </span>
          <span class="text-xs text-muted-foreground">
            {locked
              ? m.admin_locked_summary({
                  addresses: allowlist.length,
                  admins: admins.length,
                })
              : m.admin_open_summary()}
          </span>
        </span>
        <form {...setInstanceLock}>
          <input
            {...setInstanceLock.fields.locked.as("hidden", locked ? "off" : "on")}
          />
          <Button type="submit" variant={locked ? "outline" : "default"}>
            {locked ? m.admin_unlock() : m.admin_lock()}
          </Button>
        </form>
      </div>

      {#if locked && allowlist.length === 0}
        <Alert.Root variant="destructive">
          <AlertCircleIcon />
          <Alert.Description>
            {m.admin_allowlist_empty()}
          </Alert.Description>
        </Alert.Root>
      {/if}

      <form {...allowEmail}>
        <Field.FieldGroup>
          <Field.Field data-invalid={allowIssue ? true : undefined}>
            <Field.FieldLabel for="allow-email">
              {m.admin_allow_email()}
            </Field.FieldLabel>
            <div class="flex gap-2">
              <Input
                id="allow-email"
                {...allowEmail.fields.email.as("email")}
                autocomplete="off"
                placeholder="person@example.com"
              />
              <Button type="submit" variant="outline">{m.common_add()}</Button>
            </div>
            {#if allowIssue}
              <Field.FieldError>{allowIssue}</Field.FieldError>
            {/if}
          </Field.Field>
        </Field.FieldGroup>
      </form>

      {#if allowlist.length > 0}
        <ul class="flex flex-col divide-y divide-foreground/10">
          {#each allowlist as entry (entry.email)}
            {@const revoke = revokeEmail.for(entry.email)}
            <li class="flex items-center justify-between gap-4 py-2">
              <span class="flex min-w-0 flex-col gap-0.5">
                <span class="truncate text-sm">{entry.email}</span>
                <span class="text-xs text-muted-foreground">
                  {m.admin_added({
                    date: dateTime.format(entry.addedAt),
                    by: entry.addedBy,
                  })}
                </span>
              </span>
              <form {...revoke}>
                <input {...revoke.fields.email.as("hidden", entry.email)} />
                {#if revoke.fields.issues()?.[0]}
                  <span class="sr-only" role="alert">
                    {revoke.fields.issues()?.[0]?.message}
                  </span>
                {/if}
                <Button
                  type="submit"
                  variant="ghost"
                  size="icon"
                  aria-label={m.admin_remove_named({ email: entry.email })}
                  title={m.admin_remove()}
                >
                  <TrashIcon class="size-4" />
                </Button>
              </form>
            </li>
          {/each}
        </ul>
      {/if}
    </Card.Content>
  </Card.Root>

  <Card.Root class="border border-foreground/10">
    <Card.Header>
      <Card.Title>{m.admin_smtp()}</Card.Title>
      <Card.Description>{m.admin_smtp_description()}</Card.Description>
    </Card.Header>
    <Card.Content class="flex flex-col gap-6">
      {#if !smtpReady}
        <p class="text-sm text-muted-foreground">{m.common_loading()}</p>
      {:else}
        <form {...saveSmtpSettings} class="flex flex-col gap-4">
          <Field.FieldGroup class="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_8rem]">
            <Field.Field data-invalid={issue(fields.host) ? true : undefined}>
              <Field.FieldLabel for="smtp-host">{m.admin_smtp_host()}</Field.FieldLabel>
              <Input
                id="smtp-host"
                {...fields.host.as("text", smtp?.host ?? "")}
                autocomplete="off"
                placeholder="smtp.example.com"
              />
              {#if issue(fields.host)}
                <Field.FieldError>{issue(fields.host)}</Field.FieldError>
              {/if}
            </Field.Field>
            <Field.Field data-invalid={issue(fields.port) ? true : undefined}>
              <Field.FieldLabel for="smtp-port">{m.admin_smtp_port()}</Field.FieldLabel>
              <Input
                id="smtp-port"
                {...fields.port.as("number", smtp?.port ?? 587)}
                min="1"
                max="65535"
              />
              {#if issue(fields.port)}
                <Field.FieldError>{issue(fields.port)}</Field.FieldError>
              {/if}
            </Field.Field>
          </Field.FieldGroup>

          <fieldset class="flex flex-col gap-2">
            <legend class="mb-2 text-sm font-medium">{m.admin_smtp_security()}</legend>
            <div class="flex flex-wrap gap-x-6 gap-y-2">
              {#each SMTP_SECURITY as option (option)}
                <label class="flex items-center gap-2 text-sm">
                  <input
                    {...fields.security.as(
                      "radio",
                      option,
                      (smtp?.security ?? "starttls") === option,
                    )}
                    class="accent-primary"
                  />
                  {securityLabels[option]()}
                </label>
              {/each}
            </div>
          </fieldset>

          <Field.FieldGroup class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field.Field>
              <Field.FieldLabel for="smtp-username">{m.admin_smtp_username()}</Field.FieldLabel>
              <Input
                id="smtp-username"
                {...fields.username.as("text", smtp?.username ?? "")}
                autocomplete="off"
              />
            </Field.Field>
            <Field.Field>
              <Field.FieldLabel for="smtp-password">{m.admin_smtp_password()}</Field.FieldLabel>
              <Input
                id="smtp-password"
                {...fields._password.as("password")}
                autocomplete="new-password"
                placeholder={smtp?.passwordSet ? m.admin_smtp_password_set() : ""}
              />
              <Field.FieldDescription>
                {smtp?.passwordSet
                  ? m.admin_smtp_password_keep()
                  : m.admin_smtp_password_none()}
              </Field.FieldDescription>
              {#if smtp?.passwordSet}
                <label class="flex items-center gap-2 text-sm">
                  <input {...fields.clearPassword.as("checkbox")} class="accent-primary" />
                  {m.admin_smtp_password_clear()}
                </label>
              {/if}
            </Field.Field>
          </Field.FieldGroup>

          <Field.Field data-invalid={issue(fields.from) ? true : undefined}>
            <Field.FieldLabel for="smtp-from">{m.admin_smtp_from()}</Field.FieldLabel>
            <Input
              id="smtp-from"
              {...fields.from.as("email", smtp?.from ?? "")}
              autocomplete="off"
              placeholder="nuvio@example.com"
            />
            {#if issue(fields.from)}
              <Field.FieldError>{issue(fields.from)}</Field.FieldError>
            {/if}
          </Field.Field>

          <div>
            <Button type="submit">{m.admin_smtp_save()}</Button>
          </div>
        </form>

        <form
          {...sendTestEmail}
          class="flex flex-col gap-3 rounded-lg border border-foreground/10 p-4"
        >
          <span class="text-sm text-muted-foreground">{m.admin_smtp_test_description()}</span>
          <div>
            <Button type="submit" variant="outline" disabled={!smtp}>
              {m.admin_smtp_test()}
            </Button>
          </div>
          {#if testResult}
            <p class="flex items-center gap-2 text-sm" role="status">
              {#if testResult.ok}
                <CheckCircleIcon class="size-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                {m.admin_smtp_test_sent()}
              {:else}
                <AlertCircleIcon class="size-4 text-destructive" aria-hidden="true" />
                {failureMessages[testResult.code]()}
              {/if}
            </p>
          {/if}
        </form>
      {/if}
    </Card.Content>
  </Card.Root>
</div>
