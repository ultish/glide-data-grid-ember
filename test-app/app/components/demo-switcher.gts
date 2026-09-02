// Persistent nav. Playgrounds (Glide demo, Full grid) stay as their own routes. Everything else
// that used to be a tab is a cookbook chapter — see `app/utils/cookbook/chapters.ts`.
import { LinkTo } from "@ember/routing";

<template>
    <div style="flex: 0 0 auto; display: flex; gap: 6px; align-items: center; font: 13px system-ui;">
        <LinkTo @route="index" class="btn btn-xs btn-ghost" @activeClass="btn-active" data-test-show-glide>
            Glide demo grid
        </LinkTo>
        <LinkTo @route="full-grid" class="btn btn-xs btn-ghost" @activeClass="btn-active" data-test-show-full-grid>
            Full grid demo
        </LinkTo>
        <LinkTo @route="cookbook" class="btn btn-xs btn-ghost" @activeClass="btn-active" data-test-show-cookbook>
            Cookbook
        </LinkTo>
    </div>
</template>
