<script lang="ts">
	import AlertCircleIcon from "@lucide/svelte/icons/alert-circle";
	import LockIcon from "@lucide/svelte/icons/lock";
	import TrashIcon from "@lucide/svelte/icons/trash-2";
	import SignInsChart from "#lib/admin/sign-ins-chart.svelte";
	import * as Alert from "#lib/components/ui/alert/index.js";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Card from "#lib/components/ui/card/index.js";
	import * as Field from "#lib/components/ui/field/index.js";
	import { Input } from "#lib/components/ui/input/index.js";
	import { pageTitle } from "#lib/core/title.svelte.js";
	import { getLocale, m } from "#lib/i18n/index.js";
	import { resolve } from "$app/paths";
	import { allowEmail, revokeEmail, setInstanceLock } from "./admin.remote.ts";

	pageTitle.set(m.admin_title());

	let { data } = $props();

	const allowIssue = $derived(allowEmail.fields.email.issues()?.[0]?.message);

	const dateTime = new Intl.DateTimeFormat(getLocale(), {
		dateStyle: "medium",
		timeStyle: "short",
	});

	// The env var name is code, not copy: split the sentence around it so it
	// can sit in a <code> wherever the translation puts it.
	const intro = m.admin_intro({ variable: "\u0000" }).split("\u0000");
</script>

<div class="mx-auto flex w-full max-w-4xl flex-col gap-6 p-4 sm:p-6">
  <div class="flex flex-col gap-1">
    <h1 class="text-3xl font-bold tracking-tight">{m.admin_title()}</h1>
    <p class="text-sm text-muted-foreground">
      {intro[0]}<code class="text-xs">NUVIO_ADMIN_EMAILS</code>{intro[1]}
    </p>
  </div>

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
            {data.locked ? m.admin_locked() : m.admin_open()}
          </span>
          <span class="text-xs text-muted-foreground">
            {data.locked
              ? m.admin_locked_summary({
                  addresses: data.allowlist.length,
                  admins: data.admins.length,
                })
              : m.admin_open_summary()}
          </span>
        </span>
        <form {...setInstanceLock}>
          <input
            {...setInstanceLock.fields.locked.as(
              "hidden",
              data.locked ? "off" : "on",
            )}
          />
          <Button type="submit" variant={data.locked ? "outline" : "default"}>
            {data.locked ? m.admin_unlock() : m.admin_lock()}
          </Button>
        </form>
      </div>

      {#if data.locked && data.allowlist.length === 0}
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

      {#if data.allowlist.length > 0}
        <ul class="flex flex-col divide-y divide-foreground/10">
          {#each data.allowlist as entry (entry.email)}
            {@const revoke = revokeEmail.for(entry.email)}
            <li class="flex items-center justify-between gap-4 py-2">
              <span class="flex flex-col gap-0.5">
                <span class="text-sm">{entry.email}</span>
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
      <Card.Title>{m.admin_activity()}</Card.Title>
      <Card.Description>
        {m.admin_activity_description()}
      </Card.Description>
    </Card.Header>
    <Card.Content>
      <SignInsChart days={data.activity} />
    </Card.Content>
  </Card.Root>

  <Card.Root class="border border-foreground/10">
    <Card.Header>
      <Card.Title>{m.admin_sign_ins()}</Card.Title>
      <Card.Description>
        {m.admin_sign_ins_description()}
      </Card.Description>
    </Card.Header>
    <Card.Content>
      {#if data.signIns.length === 0}
        <p class="py-6 text-center text-sm text-muted-foreground">
          {m.admin_nobody()}
        </p>
      {:else}
        <div class="overflow-x-auto">
          <table class="w-full text-left text-sm">
            <thead class="text-xs text-muted-foreground">
              <tr class="border-b border-foreground/10">
                <th scope="col" class="py-2 pr-4 font-medium">{m.common_email()}</th>
                <th scope="col" class="py-2 pr-4 font-medium">{m.admin_first_seen()}</th>
                <th scope="col" class="py-2 pr-4 font-medium">{m.admin_last_seen()}</th>
                <th scope="col" class="py-2 text-right font-medium">{m.admin_sign_ins()}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-foreground/10">
              {#each data.signIns as record (record.email)}
                <tr>
                  <td class="py-2 pr-4">{record.email}</td>
                  <td class="py-2 pr-4 text-muted-foreground">
                    {dateTime.format(record.firstSeenAt)}
                  </td>
                  <td class="py-2 pr-4 text-muted-foreground">
                    {dateTime.format(record.lastSeenAt)}
                  </td>
                  <td class="py-2 text-right tabular-nums">
                    {record.signInCount}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </Card.Content>
  </Card.Root>

  <a
    href={resolve("/(protected)/(app)")}
    class="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
  >
    {m.admin_back()}
  </a>
</div>
