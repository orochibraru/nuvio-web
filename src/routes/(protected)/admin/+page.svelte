<script lang="ts">
	import AlertCircleIcon from "@lucide/svelte/icons/alert-circle";
	import LockIcon from "@lucide/svelte/icons/lock";
	import TrashIcon from "@lucide/svelte/icons/trash-2";
	import * as Alert from "#lib/components/ui/alert/index.js";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Card from "#lib/components/ui/card/index.js";
	import * as Field from "#lib/components/ui/field/index.js";
	import { Input } from "#lib/components/ui/input/index.js";
	import { pageTitle } from "#lib/stores/title.svelte.js";
	import { resolve } from "$app/paths";
	import { allowEmail, revokeEmail, setInstanceLock } from "./admin.remote.ts";

	pageTitle.set("Server admin");

	let { data } = $props();

	const allowIssue = $derived(allowEmail.fields.email.issues()?.[0]?.message);

	const dateTime = new Intl.DateTimeFormat(undefined, {
		dateStyle: "medium",
		timeStyle: "short",
	});
</script>

<div class="mx-auto flex w-full max-w-4xl flex-col gap-6 p-4 sm:p-6">
  <div class="flex flex-col gap-1">
    <h1 class="text-3xl font-bold tracking-tight">Server admin</h1>
    <p class="text-sm text-muted-foreground">
      Who has signed in to this server, and who is allowed to. Visible only to
      the addresses in <code class="text-xs">NUVIO_ADMIN_EMAILS</code>.
    </p>
  </div>

  <Card.Root class="border border-foreground/10">
    <Card.Header>
      <Card.Title>Access</Card.Title>
      <Card.Description>
        While locked, only the addresses below can sign in or register, and
        anyone else already signed in is signed out on their next request.
        Server admins are always allowed, listed or not.
      </Card.Description>
    </Card.Header>
    <Card.Content class="flex flex-col gap-6">
      <div
        class="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-foreground/10 p-4"
      >
        <span class="flex flex-col gap-0.5">
          <span class="flex items-center gap-2 text-sm font-medium">
            <LockIcon class="size-4" />
            {data.locked ? "Locked : invite only" : "Open : anyone can sign in"}
          </span>
          <span class="text-xs text-muted-foreground">
            {data.locked
              ? `${data.allowlist.length} address${data.allowlist.length === 1 ? "" : "es"} allowed, plus ${data.admins.length} server admin${data.admins.length === 1 ? "" : "s"}.`
              : "Anyone with a Nuvio account can use this server."}
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
            {data.locked ? "Unlock server" : "Lock server"}
          </Button>
        </form>
      </div>

      {#if data.locked && data.allowlist.length === 0}
        <Alert.Root variant="destructive">
          <AlertCircleIcon />
          <Alert.Description>
            The allowlist is empty, so only server admins can sign in.
          </Alert.Description>
        </Alert.Root>
      {/if}

      <form {...allowEmail}>
        <Field.FieldGroup>
          <Field.Field data-invalid={allowIssue ? true : undefined}>
            <Field.FieldLabel for="allow-email">
              Allow an email address
            </Field.FieldLabel>
            <div class="flex gap-2">
              <Input
                id="allow-email"
                {...allowEmail.fields.email.as("email")}
                autocomplete="off"
                placeholder="person@example.com"
              />
              <Button type="submit" variant="outline">Add</Button>
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
                  Added {dateTime.format(entry.addedAt)} by {entry.addedBy}
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
                  aria-label={`Remove ${entry.email} from the allowlist`}
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
      <Card.Title>Sign-ins</Card.Title>
      <Card.Description>
        One row per person, newest first. Recorded when someone signs in or
        registers on this server.
      </Card.Description>
    </Card.Header>
    <Card.Content>
      {#if data.signIns.length === 0}
        <p class="py-6 text-center text-sm text-muted-foreground">
          Nobody has signed in yet.
        </p>
      {:else}
        <div class="overflow-x-auto">
          <table class="w-full text-left text-sm">
            <thead class="text-xs text-muted-foreground">
              <tr class="border-b border-foreground/10">
                <th scope="col" class="py-2 pr-4 font-medium">Email</th>
                <th scope="col" class="py-2 pr-4 font-medium">First seen</th>
                <th scope="col" class="py-2 pr-4 font-medium">Last seen</th>
                <th scope="col" class="py-2 text-right font-medium">Sign-ins</th>
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
    Back to Nuvio
  </a>
</div>
