<script lang="ts">
	import EyeIcon from "@lucide/svelte/icons/eye";
	import EyeOffIcon from "@lucide/svelte/icons/eye-off";
	import * as Card from "#lib/components/ui/card/index.js";
	import * as Field from "#lib/components/ui/field/index.js";
	import { Input } from "#lib/components/ui/input/index.js";
	import { theme } from "#lib/settings/theme.svelte.js";
	import type { UiSettings } from "#lib/settings/ui-settings.js";

	let { update }: { update: (patch: Partial<UiSettings>) => Promise<void> } =
		$props();

	// `draft` shadows `theme.current.introDbApiKey` while the field has an
	// unsaved edit; `null` means "show the stored value" (the common case).
	let draft = $state<string | null>(null);
	let visible = $state(false);
	const value = $derived(draft ?? theme.current.introDbApiKey);

	function commit() {
		if (draft === null) {
			return;
		}
		const next = draft.trim();
		draft = null;
		if (next !== theme.current.introDbApiKey) {
			void update({ introDbApiKey: next });
		}
	}
</script>

<Card.Root class="border border-foreground/10">
  <Card.Header>
    <Card.Title>Integrations</Card.Title>
    <Card.Description>Optional keys for third-party services.</Card.Description>
  </Card.Header>
  <Card.Content>
    <Field.FieldGroup>
      <Field.Field>
        <Field.FieldLabel for="introdb-key">
          <a
            href="https://theintrodb.org"
            target="_blank"
            rel="noopener noreferrer"
            class="underline underline-offset-4 hover:text-foreground"
          >
            TheIntroDB
          </a>
          API key
        </Field.FieldLabel>
        <div class="relative">
          <Input
            id="introdb-key"
            type={visible ? "text" : "password"}
            autocomplete="off"
            spellcheck="false"
            placeholder="Not set : public data is used"
            class="pr-10"
            {value}
            oninput={(event) => (draft = event.currentTarget.value)}
            onblur={commit}
            onkeydown={(event) =>
              event.key === "Enter" && event.currentTarget.blur()}
          />
          <button
            type="button"
            aria-label={visible ? "Hide key" : "Show key"}
            onclick={() => (visible = !visible)}
            class="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground"
          >
            {#if visible}<EyeOffIcon class="size-4" />{:else}<EyeIcon
                class="size-4"
              />{/if}
          </button>
        </div>
        <Field.FieldDescription>
          Skip-intro / outro timestamps already work without one : this only
          folds in your own pending submissions and raises your rate limit.
        </Field.FieldDescription>
      </Field.Field>
    </Field.FieldGroup>
  </Card.Content>
</Card.Root>
