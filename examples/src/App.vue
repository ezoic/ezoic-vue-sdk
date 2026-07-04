<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import {
  EzoicAd,
  EzoicVideo,
  EzoicVideoEmbed,
  useEzoic,
  useEzoicConsent,
  useEzoicPageView,
  useEzoicRewarded,
  type EzoicConfigOptions,
} from '@ezoic/vue-sdk';

// --- Event log -------------------------------------------------------------
// Every user action and every reactive state change appends a timestamped
// line. The array is bounded so a long-running demo never grows without limit.
interface LogEntry {
  time: string;
  msg: string;
}

const LOG_LIMIT = 100;
const logLines = ref<LogEntry[]>([]);

function log(msg: string): void {
  logLines.value.unshift({ time: new Date().toLocaleTimeString(), msg });
  if (logLines.value.length > LOG_LIMIT) {
    logLines.value.length = LOG_LIMIT;
  }
}

// --- SDK surface -----------------------------------------------------------
const ezoic = useEzoic();
const consent = useEzoicConsent();
// No loaderUrl passed here: this composable falls back to whatever loader the
// plugin configured (via `rewardedLoaderUrl`) at app setup. If neither this
// build nor the plugin options supply a loader, nothing drains the
// ezRewardedAds command queue, so `rewarded.ready` stays false and the
// request/contentLocker promises stay pending (the "→ awaiting…" log lines
// never get a result line). With a loader configured, `ready` reflects the
// loader script's own init state — whether a request then resolves with a
// fill depends on the runtime context that script expects from the host
// page (see the "Rewarded ads" panel copy below for detail).
const rewarded = useEzoicRewarded();

// --- Status bar ------------------------------------------------------------
const ezoicUserResult = ref<string>('pending…');

watch(ezoic.ready, (value) => log(`useEzoic().ready → ${value}`), {
  immediate: true,
});

// --- Dynamic content (incremental showAds) ---------------------------------
interface AdUnit {
  key: number;
  location: string;
  sizes: string[];
}

let nextDynamicKey = 1;
const dynamicUnits = ref<AdUnit[]>([]);

function addAdUnit(): void {
  const key = nextDynamicKey++;
  dynamicUnits.value.push({
    key,
    location: 'bottom_of_page',
    sizes: ['300x250', '336x280'],
  });
  log(`added dynamic ad unit #${key} (location=bottom_of_page)`);
}

// --- SPA simulated navigation ----------------------------------------------
// Scan mode: on each pageKey change the composable calls showAds() with no
// args (flush: 'post', not immediate). The <EzoicAd> set below is keyed by
// pageKey, so bumping the key unmounts the previous placeholders (the SDK
// destroys them) and mounts a fresh set.
const pageKey = ref(1);
useEzoicPageView(() => pageKey.value);

const spaAds = computed<AdUnit[]>(() =>
  pageKey.value % 2 === 1
    ? [
        { key: 1, location: 'top_of_page', sizes: ['728x90', '320x50'] },
        { key: 2, location: 'mid_content', sizes: ['300x250', '728x90'] },
      ]
    : [
        {
          key: 1,
          location: 'under_first_paragraph',
          sizes: ['300x250', '336x280'],
        },
        { key: 2, location: 'bottom_of_page', sizes: ['728x90', '320x50'] },
      ],
);

function simulateNavigation(): void {
  pageKey.value += 1;
  log(`simulated navigation → virtual page ${pageKey.value}`);
}

// --- Consent + configuration -----------------------------------------------
function applyReserveSpace(): void {
  const options: EzoicConfigOptions = { reservePlaceholderSpace: true };
  ezoic.config(options);
  log('config({ reservePlaceholderSpace: true })');
}

function toggleAnchor(enabled: boolean): void {
  ezoic.setEzoicAnchorAd(enabled);
  log(`setEzoicAnchorAd(${enabled})`);
}

function allowInterstitial(): void {
  ezoic.setInterstitialAllowed(true);
  log('setInterstitialAllowed(true)');
}

async function allowOutstream(): Promise<void> {
  log('setOutstreamAllowed(true) → awaiting…');
  const allowed = await ezoic.setOutstreamAllowed(true);
  log(`setOutstreamAllowed resolved → ${allowed}`);
}

function enableConsent(): void {
  ezoic.enableConsent();
  log('enableConsent()');
}

function allowPersonalizedAds(): void {
  ezoic.setDisablePersonalizedAds(false);
  log('setDisablePersonalizedAds(false)');
}

const consentStringPreview = computed<string>(() => {
  const value = consent.consentString.value;
  if (!value) return 'null';
  return value.length > 24 ? `${value.slice(0, 24)}…` : value;
});

watch(consent.eventStatus, (value) =>
  log(`consent eventStatus → ${value ?? 'null'}`),
);

// --- Rewarded --------------------------------------------------------------
watch(rewarded.status, (value) => log(`rewarded status → ${value}`));

async function requestAndShowRewarded(): Promise<void> {
  log('rewarded.requestAndShow({ rewardName: "demo" }) → awaiting…');
  const result = await rewarded.requestAndShow({ rewardName: 'demo' });
  log(
    `rewarded result → status=${result.status} reward=${result.reward} msg="${result.msg}"`,
  );
}

async function runContentLocker(): Promise<void> {
  log('rewarded.contentLocker(...) → awaiting…');
  const result = await rewarded.contentLocker(() => log('reward earned'));
  log(`contentLocker result → status=${result.status} msg="${result.msg}"`);
}

// --- Lifecycle -------------------------------------------------------------
onMounted(() => {
  ezoic.initRewardedAds();
  log('initRewardedAds()');

  const immediate = ezoic.isEzoicUser(100, (isUser) => {
    ezoicUserResult.value = String(isUser);
    log(`isEzoicUser callback → ${isUser}`);
  });
  ezoicUserResult.value = String(immediate);
  log(`isEzoicUser(100) returned → ${immediate}`);
});
</script>

<template>
  <div class="demo">
    <header class="demo-header">
      <h1>@ezoic/vue-sdk — feature demo</h1>
      <p class="note">
        This page exercises every SDK feature end to end. Ad fill requires the
        page to be served from a domain with live Ezoic demand and enough page
        content for Ezoic's ad-density rules to allow ad positions; rewarded ads
        require this build to have been configured with a rewarded loader URL.
        On a build or host missing either, the demo still proves wiring and
        structure, just not fills.
      </p>
      <div class="status-bar">
        <span class="pill" :class="ezoic.ready.value ? 'on' : 'off'">
          ready: {{ ezoic.ready.value }}
        </span>
        <span class="pill">isEzoicUser(100): {{ ezoicUserResult }}</span>
        <span class="pill">virtual page: {{ pageKey }}</span>
      </div>
    </header>

    <main class="content">
      <section class="panel">
        <h2>About this demo</h2>
        <p>
          <code>@ezoic/vue-sdk</code> is a thin Vue 3 wrapper around
          <code>ezstandalone</code>, the client-side runtime Ezoic uses to
          bootstrap consent, request ad positions, and manage their lifecycle in
          the browser. Rather than asking a publisher to hand-wire script tags,
          imperative init calls, and manual teardown logic, the SDK exposes a
          Vue plugin, a handful of composables, and a set of components so ad
          behavior can be declared the way the rest of a Vue application is
          declared: as reactive state and template markup.
        </p>
        <p>
          The plugin handles one-time setup — injecting the CMP consent script
          when configured, marking the app as a single-page application so route
          changes are treated as new pageviews instead of incremental ad
          requests, and optionally wiring a rewarded ads loader. Composables
          such as <code>useEzoic</code>, <code>useEzoicConsent</code>,
          <code>useEzoicPageView</code>, and
          <code>useEzoicRewarded</code> expose the underlying runtime's state
          and methods as reactive refs and functions, so a component can read
          consent status or trigger a rewarded ad request without touching
          global window state directly.
        </p>
        <p>
          Components handle placement. <code>&lt;EzoicAd&gt;</code> mounts a
          placeholder either by a semantic location name (zero-config locations
          such as <code>top_of_page</code> or <code>mid_content</code>, resolved
          by Ezoic's own layout logic) or by a specific numeric placement id,
          and unmounts cleanly when removed from the DOM — which matters for
          dynamic and SPA-style content where ad units are added, removed, or
          replaced as the page changes. <code>&lt;EzoicVideo&gt;</code> and
          <code>&lt;EzoicVideoEmbed&gt;</code> cover the ad-bundle video
          placeholder and a self-contained Open Video embed, respectively.
        </p>
        <p>
          One thing this demo can't fully control is whether a given ad
          placement actually fills. Ad platforms, including Ezoic, use signals
          about a page's content — how much text it has, and how that text is
          distributed and structured — to decide how many ad positions a page is
          eligible to show, independent of how many
          <code>&lt;EzoicAd&gt;</code> components are mounted in the DOM. A page
          that is mostly short button labels and status pills, rather than
          substantive prose, may simply not have enough content to qualify for
          any ad positions under those rules. That's part of why this page
          includes a written section like this one: not as a placement, but so
          the demo carries enough real text to be a meaningful test of the SDK's
          behavior on a page that looks more like typical published content.
        </p>
        <p>
          The sections below walk through the SDK's surface area one feature at
          a time: zero-config display ads placed by semantic location, a
          placement addressed by numeric id with required fill behavior, dynamic
          ad units added incrementally after the initial load, simulated SPA
          navigation that swaps placeholders on a virtual page change, consent
          and runtime configuration controls, rewarded ads gated on a configured
          loader, and video embeds via both the ad-bundle player and the
          standalone Open Video embed. Each panel logs its actions to the event
          log at the bottom of the page so the underlying composable and
          component behavior is visible as it happens.
        </p>
      </section>

      <section class="panel">
        <h2>Display ads — zero-config locations</h2>
        <p>
          Each <code>&lt;EzoicAd location="…"&gt;</code> passes explicit
          <code>sizes</code>; <code>required</code> defaults to
          <code>true</code> for locations.
        </p>
        <div class="ad-slot">
          <span class="ad-label">top_of_page</span>
          <EzoicAd location="top_of_page" :sizes="['728x90', '320x50']" />
        </div>
        <div class="ad-slot">
          <span class="ad-label">under_first_paragraph</span>
          <EzoicAd
            location="under_first_paragraph"
            :sizes="['300x250', '336x280']"
          />
        </div>
        <div class="ad-slot">
          <span class="ad-label">mid_content</span>
          <EzoicAd location="mid_content" :sizes="['300x250', '728x90']" />
        </div>
      </section>

      <section class="panel">
        <h2>Numeric-id placement</h2>
        <p>
          The numeric path with explicit <code>sizes</code> and
          <code>:required="true"</code>.
        </p>
        <div class="ad-slot">
          <span class="ad-label">id 101</span>
          <EzoicAd :id="101" :sizes="['300x250', '336x280']" :required="true" />
        </div>
      </section>

      <section class="panel">
        <h2>Dynamic content — incremental showAds</h2>
        <p>
          Mounting a new <code>&lt;EzoicAd&gt;</code> joins the SDK's per-tick
          batch (a <code>displayMore</code> after the first pageview).
        </p>
        <button type="button" @click="addAdUnit">Add ad unit</button>
        <div v-for="unit in dynamicUnits" :key="unit.key" class="ad-slot">
          <span class="ad-label">{{ unit.location }} #{{ unit.key }}</span>
          <EzoicAd :location="unit.location" :sizes="unit.sizes" />
        </div>
      </section>

      <section class="panel">
        <h2>SPA simulated navigation</h2>
        <p>
          <code>useEzoicPageView(() =&gt; pageKey)</code> in scan mode. Bumping
          the page unmounts the current placeholders and mounts a new set; the
          watcher also fires <code>showAds()</code>.
        </p>
        <button type="button" @click="simulateNavigation">
          Simulate navigation
        </button>
        <div v-for="ad in spaAds" :key="`${pageKey}-${ad.key}`" class="ad-slot">
          <span class="ad-label">{{ ad.location }}</span>
          <EzoicAd :location="ad.location" :sizes="ad.sizes" />
        </div>
      </section>

      <section class="panel">
        <h2>Consent + configuration</h2>
        <div class="button-row">
          <button type="button" @click="applyReserveSpace">
            config reservePlaceholderSpace
          </button>
          <button type="button" @click="toggleAnchor(true)">anchor on</button>
          <button type="button" @click="toggleAnchor(false)">anchor off</button>
          <button type="button" @click="allowInterstitial">
            interstitial allow
          </button>
          <button type="button" @click="allowOutstream">
            outstream allow (await)
          </button>
          <button type="button" @click="enableConsent">enableConsent</button>
          <button type="button" @click="allowPersonalizedAds">
            personalized ads on
          </button>
        </div>
        <dl class="state-grid">
          <dt>tcfLoaded</dt>
          <dd>{{ consent.tcfLoaded.value }}</dd>
          <dt>consentString</dt>
          <dd>{{ consentStringPreview }}</dd>
          <dt>gdprApplies</dt>
          <dd>{{ consent.gdprApplies.value ?? 'undefined' }}</dd>
          <dt>eventStatus</dt>
          <dd>{{ consent.eventStatus.value ?? 'null' }}</dd>
        </dl>
      </section>

      <section class="panel">
        <h2>Rewarded ads</h2>
        <p>
          <code>ready</code> stays false unless a rewarded loader URL was
          configured for this build (via the plugin's
          <code>rewardedLoaderUrl</code> option — publishers point this at their
          own domain's loader script). Once the loader script has initialized,
          <code>ready</code> flips true and these buttons queue a real request
          through <code>window.ezRewardedAds</code>. Whether a request actually
          resolves with a fill depends on the host page providing the same
          ad-insertion context the loader script expects at runtime; a host that
          serves only the SDK's client-side script without that context can
          leave a request pending indefinitely even once <code>ready</code> is
          true. Watch the <code>status</code> value below and the event log for
          the outcome.
        </p>
        <div class="button-row">
          <button type="button" @click="requestAndShowRewarded">
            Request &amp; show rewarded
          </button>
          <button type="button" @click="runContentLocker">
            Content locker
          </button>
        </div>
        <dl class="state-grid">
          <dt>ready</dt>
          <dd>{{ rewarded.ready.value }}</dd>
          <dt>status</dt>
          <dd>{{ rewarded.status.value }}</dd>
        </dl>
      </section>

      <section class="panel">
        <h2>Video</h2>
        <p>
          <code>&lt;EzoicVideo&gt;</code> is the ad-bundle video placeholder
          (requires the plugin). <code>&lt;EzoicVideoEmbed&gt;</code> is a
          self-contained Open Video embed — replace the placeholder video id
          with a real one for production.
        </p>
        <div class="ad-slot">
          <span class="ad-label">EzoicVideo — div-id 900001</span>
          <!-- Video div ids must be numeric strings: ezstandalone drops
               non-numeric ids from displayMoreVideo, so the video never loads. -->
          <EzoicVideo div-id="900001" />
        </div>
        <div class="ad-slot">
          <span class="ad-label">EzoicVideoEmbed — EXAMPLE_VIDEO_ID</span>
          <div class="video-embed-wrap">
            <EzoicVideoEmbed video-id="EXAMPLE_VIDEO_ID" :autoplay="false" />
          </div>
        </div>
      </section>
    </main>

    <aside class="log-panel">
      <h2>Event log</h2>
      <ol class="log-list">
        <li v-for="(entry, index) in logLines" :key="index">
          <span class="log-time">{{ entry.time }}</span>
          <span class="log-msg">{{ entry.msg }}</span>
        </li>
      </ol>
    </aside>
  </div>
</template>

<style scoped>
/*
 * Layout and readability only. No selector targets the SDK placeholder div
 * (`[id^="ezoic-pub-ad-placeholder-"]`) — that element stays bare per the
 * Ezoic DOM contract. Only section containers, labels, and the video-embed
 * wrapper are styled.
 */
.demo {
  font-family:
    system-ui,
    -apple-system,
    Segoe UI,
    Roboto,
    sans-serif;
  color: #1f2933;
  max-width: 1100px;
  margin: 0 auto;
  padding: 1.5rem 1.5rem 24rem;
  line-height: 1.5;
}

.demo-header h1 {
  margin-bottom: 0.25rem;
}

.note {
  color: #616e7c;
  font-size: 0.9rem;
  margin-top: 0;
}

.status-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin: 0.75rem 0 0;
}

.pill {
  background: #e4e7eb;
  border-radius: 999px;
  padding: 0.2rem 0.7rem;
  font-size: 0.85rem;
  font-variant-numeric: tabular-nums;
}

.pill.on {
  background: #c6f6d5;
}

.pill.off {
  background: #fed7d7;
}

.content {
  display: grid;
  gap: 1.25rem;
  margin-top: 1.25rem;
}

.panel {
  border: 1px solid #cbd2d9;
  border-radius: 10px;
  padding: 1rem 1.25rem;
  background: #fff;
}

.panel h2 {
  margin-top: 0;
  font-size: 1.1rem;
}

.panel p {
  color: #52606d;
  font-size: 0.9rem;
}

code {
  background: #f0f4f8;
  padding: 0.05rem 0.3rem;
  border-radius: 4px;
  font-size: 0.85em;
}

.ad-slot {
  border: 1px dashed #9aa5b1;
  border-radius: 8px;
  padding: 0.75rem;
  margin-top: 0.75rem;
  background: #f7fafc;
}

.ad-label {
  display: block;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #7b8794;
  margin-bottom: 0.5rem;
}

button {
  background: #2563eb;
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 0.45rem 0.9rem;
  font-size: 0.9rem;
  cursor: pointer;
}

button:hover {
  background: #1d4ed8;
}

.button-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.state-grid {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 0.25rem 1rem;
  margin: 0.75rem 0 0;
  font-size: 0.9rem;
}

.state-grid dt {
  font-weight: 600;
  color: #52606d;
}

.state-grid dd {
  margin: 0;
  font-variant-numeric: tabular-nums;
  word-break: break-all;
}

.video-embed-wrap {
  width: 100%;
  max-width: 640px;
  aspect-ratio: 16 / 9;
}

.log-panel {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  max-height: 22rem;
  overflow: auto;
  background: #1f2933;
  color: #e4e7eb;
  border-top: 3px solid #2563eb;
  padding: 0.75rem 1.25rem;
}

.log-panel h2 {
  margin: 0 0 0.5rem;
  font-size: 0.95rem;
  color: #fff;
}

.log-list {
  list-style: none;
  margin: 0;
  padding: 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.8rem;
}

.log-list li {
  display: flex;
  gap: 0.75rem;
  padding: 0.1rem 0;
  border-bottom: 1px solid #323f4b;
}

.log-time {
  color: #9aa5b1;
  flex: 0 0 auto;
  font-variant-numeric: tabular-nums;
}

.log-msg {
  word-break: break-word;
}
</style>
