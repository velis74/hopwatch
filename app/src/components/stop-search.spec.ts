import { describe, expect, it } from 'vitest';

import { flushPromises, HttpResponse, mockApi, mountApp } from '../test-utils';

import StopSearch from './stop-search.vue';

const LJUBLJANA = { id: 'si:1', name: 'Ljubljana', lat: 46.0569, lon: 14.5058 };
const LJUBLJANA_TIVOLI = { id: 'si:2', name: 'Ljubljana Tivoli', lat: 46.06, lon: 14.5 };

const DEBOUNCE_MS = 250;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function render(props: Record<string, unknown> = {}) {
  const { wrapper } = await mountApp(StopSearch, { props });
  const input = wrapper.get<HTMLInputElement>('input');
  return { wrapper, input };
}

/** Types into the field and waits until the search has been answered. */
async function type(input: Awaited<ReturnType<typeof render>>['input'], text: string) {
  await input.trigger('focus');
  await input.setValue(text);
  await wait(DEBOUNCE_MS + 20);
  await flushPromises();
}

function options(): string[] {
  return [...document.body.querySelectorAll('.v-overlay-container .v-list-item')].map((item) =>
    (item.textContent ?? '').trim(),
  );
}

describe('StopSearch', () => {
  it('is a labelled field with a hint', async () => {
    const { wrapper, input } = await render();

    const label = wrapper.get('label');
    expect(label.text()).toBe('Find a stop');
    expect(input.attributes('aria-describedby')).toContain('stop-search-hint');
    expect(wrapper.get('#stop-search-hint').text()).toBe('Type at least two letters of the stop name.');
  });

  it('searches the typed name and offers the stops found', async () => {
    const requests = mockApi('get', '/stops', [LJUBLJANA, LJUBLJANA_TIVOLI]);
    const { input } = await render();

    await type(input, ' Lj ');

    expect(requests.map((request) => request.url.searchParams.get('q'))).toEqual(['Lj']);
    expect(options()).toEqual(['Ljubljana', 'Ljubljana Tivoli']);
  });

  it('does not search fewer than two letters', async () => {
    const { input } = await render();

    await type(input, 'L');

    expect(options()).toEqual([]);
  });

  it('emits the stop the user picks', async () => {
    mockApi('get', '/stops', [LJUBLJANA, LJUBLJANA_TIVOLI]);
    const { wrapper, input } = await render();
    await type(input, 'Ljub');

    const option = [...document.body.querySelectorAll<HTMLElement>('.v-overlay-container .v-list-item')].find((item) =>
      item.textContent?.includes('Tivoli'),
    );
    option!.click();
    await flushPromises();

    expect(wrapper.emitted('select')).toEqual([[LJUBLJANA_TIVOLI]]);
  });

  it('says so when no stop matches', async () => {
    mockApi('get', '/stops', []);
    const { input } = await render();

    await type(input, 'Xyz');

    expect(options()).toEqual(['No stops found.']);
  });

  it('says no stop matches when the search fails', async () => {
    mockApi('get', '/stops', () => HttpResponse.error());
    const { input } = await render();

    await type(input, 'Ko');

    expect(options()).toEqual(['No stops found.']);
  });

  it('clears the results when the text gets shorter than two letters', async () => {
    mockApi('get', '/stops', [LJUBLJANA]);
    const { input } = await render();
    await type(input, 'Lj');
    expect(options()).toEqual(['Ljubljana']);

    await type(input, 'L');

    expect(options()).not.toContain('Ljubljana');
    expect(options()).not.toContain('No stops found.');
  });

  it('shows only the answer to the latest text', async () => {
    let answerFirst: () => void = () => undefined;
    mockApi('get', '/stops', async ({ request }: { request: Request }) => {
      const q = new URL(request.url).searchParams.get('q');
      if (q === 'Lj') {
        await new Promise<void>((resolve) => (answerFirst = resolve));
        return HttpResponse.json([LJUBLJANA]);
      }
      return HttpResponse.json([LJUBLJANA_TIVOLI]);
    });
    const { input } = await render();

    await type(input, 'Lj');
    await type(input, 'Ljubljana T');
    answerFirst();
    await wait(20);
    await flushPromises();

    expect(options()).toEqual(['Ljubljana Tivoli']);
  });

  it('takes focus when asked to', async () => {
    const { input } = await render({ autofocus: true });

    expect(document.activeElement).toBe(input.element);
  });

  it('leaves focus alone by default', async () => {
    const { input } = await render();

    expect(document.activeElement).not.toBe(input.element);
  });
});
