import { describe, expect, it } from 'vitest';
import { defineComponent, h, ref } from 'vue';

import type { Experience } from '../stores/preferences';
import { mountApp } from '../test-utils';

import ExperienceChoice from './experience-choice.vue';

/** The choice bound to a parent's value, as the settings page and the first-start dialog use it. */
const Host = defineComponent({
  props: { initial: { type: String, default: null } },
  setup(props) {
    const chosen = ref<Experience | null>(props.initial as Experience | null);
    return () =>
      h('div', [
        h(ExperienceChoice, {
          modelValue: chosen.value,
          'onUpdate:modelValue': (value: Experience | null) => (chosen.value = value),
        }),
        h('output', chosen.value ?? 'none'),
      ]);
  },
});

function radio(label: string): HTMLInputElement {
  const found = [...document.querySelectorAll<HTMLInputElement>('input[type="radio"]')].find(
    (input) => input.labels?.[0]?.textContent?.trim() === label,
  );
  if (!found) throw new Error(`no radio labelled ${label}`);
  return found;
}

describe('experience-choice', () => {
  it('offers both experiences as one labelled radio group, each with its description', async () => {
    const { wrapper } = await mountApp(Host);

    const group = wrapper.get('[role="radiogroup"]');
    expect(document.getElementById(group.attributes('aria-labelledby')!)?.textContent).toBe('Experience');
    for (const [label, description] of [
      ['Simple and large', 'Larger text and buttons, calm screens without animation.'],
      ['Lively', 'Compact layout with subtle animation.'],
    ]) {
      const input = radio(label);
      expect(document.getElementById(input.getAttribute('aria-describedby')!)?.textContent?.trim()).toBe(description);
      expect(input.checked).toBe(false);
    }
    expect(radio('Simple and large').name).toBe(radio('Lively').name);
    expect(wrapper.get('output').text()).toBe('none');
  });

  it('shows the current choice and reports a new one', async () => {
    const { wrapper } = await mountApp(Host, { props: { initial: 'lively' } });
    expect(radio('Lively').checked).toBe(true);

    await wrapper.find(`input[value="simple"]`).setValue(true);

    expect(wrapper.get('output').text()).toBe('simple');
    expect(radio('Simple and large').checked).toBe(true);
    expect(radio('Lively').checked).toBe(false);
  });

  it('speaks the language of the interface', async () => {
    await mountApp(Host, { locale: 'sl' });

    expect(radio('Preprosto in veliko')).toBeDefined();
    expect(radio('Živahno')).toBeDefined();
    expect(document.body.textContent).toContain('Način prikaza');
  });

  it('gives the descriptions of two choices on one page distinct ids', async () => {
    const Twice = defineComponent(() => () => h('div', [h(Host), h(Host)]));
    await mountApp(Twice);

    const ids = [...document.querySelectorAll('input[type="radio"]')].map((input) =>
      input.getAttribute('aria-describedby'),
    );
    expect(new Set(ids).size).toBe(4);
  });
});
