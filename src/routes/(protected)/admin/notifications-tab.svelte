<script lang="ts">
	import BellIcon from "@lucide/svelte/icons/bell";
	import EmptyState from "#lib/components/feedback/empty-state.svelte";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Card from "#lib/components/ui/card/index.js";
	import { Switch } from "#lib/components/ui/switch/index.js";
	import { getLocale, m } from "#lib/i18n/index.js";
	import type { StoredNotification } from "#lib/services/admin-notifier.service.js";
	import { resolve } from "$app/paths";
	import {
		markAllNotificationsRead,
		markNotificationRead,
		setNotificationEmail,
	} from "./admin.remote.ts";

	let {
		items,
		emailEnabled,
		smtpConfigured,
	}: {
		items: StoredNotification[];
		emailEnabled: boolean;
		smtpConfigured: boolean;
	} = $props();

	const unread = $derived(items.filter((item) => !item.read).length);
	const dateTime = $derived(
		new Intl.DateTimeFormat(getLocale(), {
			dateStyle: "medium",
			timeStyle: "short",
		}),
	);
</script>

<div class="flex flex-col gap-6">
  <Card.Root class="border border-foreground/10">
    <Card.Content class="flex flex-wrap items-center justify-between gap-4">
      <span class="flex flex-col gap-0.5">
        <span id="email-notifications-label" class="text-sm font-medium">
          {m.admin_notifications_email()}
        </span>
        <span class="text-xs text-muted-foreground">
          {smtpConfigured
            ? m.admin_notifications_email_description()
            : m.admin_notifications_email_no_smtp()}
        </span>
      </span>
      <form {...setNotificationEmail}>
        <input
          {...setNotificationEmail.fields.enabled.as(
            "hidden",
            emailEnabled ? "off" : "on",
          )}
        />
        <Switch
          checked={emailEnabled}
          aria-labelledby="email-notifications-label"
          onCheckedChange={() => {
            void setNotificationEmail.submit();
          }}
        />
      </form>
    </Card.Content>
  </Card.Root>

  <Card.Root class="border border-foreground/10">
    <Card.Header class="flex flex-wrap items-start justify-between gap-2">
      <div class="flex flex-col gap-1.5">
        <Card.Title>{m.admin_notifications()}</Card.Title>
        <Card.Description>{m.admin_notifications_description()}</Card.Description>
      </div>
      {#if unread > 0}
        <form {...markAllNotificationsRead}>
          <Button type="submit" variant="outline" size="sm">
            {m.admin_notifications_mark_all()}
          </Button>
        </form>
      {/if}
    </Card.Header>
    <Card.Content>
      {#if items.length === 0}
        <EmptyState icon={BellIcon} title={m.admin_notifications_empty()} />
      {:else}
        <ul class="flex flex-col divide-y divide-foreground/10">
          {#each items as item (item.id)}
            {@const markRead = markNotificationRead.for(String(item.id))}
            <li class="flex flex-wrap items-center justify-between gap-3 py-3">
              <span class="flex min-w-0 items-start gap-3">
                <span
                  class="mt-1.5 size-2 shrink-0 rounded-full {item.read ? 'bg-transparent' : 'bg-primary'}"
                  aria-hidden="true"
                ></span>
                <span class="flex min-w-0 flex-col gap-0.5">
                  <span class="text-sm {item.read ? 'text-muted-foreground' : 'font-medium'}">
                    {#if !item.read}
                      <span class="sr-only">{m.admin_notifications_unread()}:</span>
                    {/if}
                    {m.admin_notification_custom_backend_seen()}
                  </span>
                  <span class="truncate text-xs text-muted-foreground">
                    {item.notification.url} · {dateTime.format(item.createdAt)}
                  </span>
                </span>
              </span>
              <span class="flex items-center gap-2">
                <Button
                  href={`${resolve("admin")}?tab=backends`}
                  variant="ghost"
                  size="sm"
                >
                  {m.admin_notification_review()}
                </Button>
                {#if !item.read}
                  <form {...markRead}>
                    <input {...markRead.fields.id.as("hidden", String(item.id))} />
                    <Button type="submit" variant="outline" size="sm">
                      {m.admin_notifications_mark_read()}
                    </Button>
                  </form>
                {/if}
              </span>
            </li>
          {/each}
        </ul>
      {/if}
    </Card.Content>
  </Card.Root>
</div>
