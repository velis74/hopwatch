import { describe, expect, it } from 'vitest';

import { flushPromises, HttpResponse, mockApi, mountApp } from '../test-utils';

import StopSearch from './stop-search.vue';

const LJUBLJANA = { id: 'si:1', name: 'Ljubljana', lat: 46.0569, lon: 14.5058, modes: ['rail', 'bus'] };
const LJUBLJANA_TIVOLI = { id: 'si:2', name: 'Ljubljana Tivoli', lat: 46.06, lon: 14.5, modes: [] };

const DEBOUNCE_MS = 250;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function render(props: Record<string, unknown> = {}) {
  const { wrapper } = await mountApp(StopSearch, { props: { label: 'From', ...props } });
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
  it('is a field with the given label and a hint', async () => {
    const { wrapper, input } = await render();

    const label = wrapper.get('label');
    expect(label.text()).toBe('From');
    const described = input
      .attributes('aria-describedby')!
      .split(' ')
      .map((id) => document.getElementById(id)?.textContent?.trim());
    expect(described).toContain('Type at least two letters of the stop name.');
  });

  it('searches the typed name and offers the stops found', async () => {
    const requests = mockApi('get', '/stops', [LJUBLJANA, LJUBLJANA_TIVOLI]);
    const { input } = await render();

    await type(input, ' Lj ');

    expect(requests.map((request) => request.url.searchParams.get('q'))).toEqual(['Lj']);
    // A stop's modes are the second line of its option, after a comma only screen readers read.
    expect(options()).toEqual(['Ljubljana, Train and Bus', 'Ljubljana Tivoli']);
    const modes = document.body.querySelector('.v-overlay-container .v-list-item div.stop-search-modes');
    expect(modes?.textContent).toBe('Train and Bus');
  });

  it("names each option by the stop's name, then its modes after a comma", async () => {
    mockApi('get', '/stops', [LJUBLJANA, LJUBLJANA_TIVOLI]);
    const { input } = await render();

    await type(input, 'Lj');

    const names = [...document.body.querySelectorAll('.v-overlay-container .v-list-item')].map((item) =>
      item.getAttribute('aria-label'),
    );
    expect(names).toEqual(['Ljubljana, Train and Bus', 'Ljubljana Tivoli']);
  });

  it('does not search fewer than two letters', async () => {
    const requests = mockApi('get', '/stops', [LJUBLJANA]);
    const { input } = await render();

    await type(input, 'L');

    expect(requests).toHaveLength(0);
    expect(options()).toEqual(['Type at least two letters of the stop name.']);
  });

  it('sets the stop the user picks and shows it', async () => {
    mockApi('get', '/stops', [LJUBLJANA, LJUBLJANA_TIVOLI]);
    const { wrapper, input } = await render();
    await type(input, 'Ljub');

    const option = [...document.body.querySelectorAll<HTMLElement>('.v-overlay-container .v-list-item')].find((item) =>
      item.textContent?.includes('Tivoli'),
    );
    option!.click();
    await flushPromises();

    expect(wrapper.emitted('update:modelValue')).toEqual([[LJUBLJANA_TIVOLI]]);
    await wrapper.setProps({ modelValue: LJUBLJANA_TIVOLI });
    expect(wrapper.get('.v-autocomplete').text()).toContain('Ljubljana Tivoli');
  });

  it('shows the stop it is given by its name and does not search for it', async () => {
    const requests = mockApi('get', '/stops', [LJUBLJANA]);
    const { wrapper } = await render({ modelValue: LJUBLJANA });
    await flushPromises();

    expect(wrapper.get('.v-autocomplete .v-chip').text()).toContain('Ljubljana');
    expect(requests).toHaveLength(0);
  });

  it('describes the chosen stop to screen readers', async () => {
    const { wrapper, input } = await render({ modelValue: LJUBLJANA });
    expect(input.attributes('aria-description')).toBe('Ljubljana');

    await wrapper.setProps({ modelValue: null });

    expect(wrapper.get('input').attributes('aria-description')).toBeUndefined();
  });

  it('can be cleared with a button in the tab order when asked to', async () => {
    const { wrapper } = await render({ modelValue: LJUBLJANA, clearable: true });

    const clear = wrapper.get('button[aria-label="Clear From"]');
    expect(clear.attributes('tabindex')).toBeUndefined();
    await clear.trigger('click');

    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([null]);
  });

  it('has no clear button without a stop or when not asked to', async () => {
    const { wrapper } = await render({ modelValue: LJUBLJANA });
    expect(wrapper.find('button[aria-label="Clear From"]').exists()).toBe(false);

    await wrapper.setProps({ modelValue: null, clearable: true });

    expect(wrapper.find('button[aria-label="Clear From"]').exists()).toBe(false);
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
    expect(options()).toEqual(['Ljubljana, Train and Bus']);

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
