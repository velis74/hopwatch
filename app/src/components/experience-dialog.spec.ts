import { describe, expect, it } from 'vitest';

import { usePreferencesStore } from '../stores/preferences';
import { flushPromises, mountApp } from '../test-utils';

import ExperienceDialog from './experience-dialog.vue';

function dialog(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[role="dialog"]');
}

function continueButton(): HTMLButtonElement {
  const button = [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(
    (element) => element.textContent?.trim() === 'Continue',
  );
  if (!button) throw new Error('no Continue button');
  return button;
}

function radio(value: string): HTMLInputElement {
  return document.querySelector<HTMLInputElement>(`[role="dialog"] input[type="radio"][value="${value}"]`)!;
}

async function choose(value: string): Promise<void> {
  radio(value).click();
  await flushPromises();
}

function tab(shiftKey = false): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true, shiftKey });
  (document.activeElement ?? document.body).dispatchEvent(event);
  return event;
}

describe('experience-dialog', () => {
  it('asks for the experience on first start, titled and introduced', async () => {
    await mountApp(ExperienceDialog);

    const shown = dialog();
    expect(shown).not.toBeNull();
    const title = document.getElementById('experience-dialog-title');
    expect(title?.tagName).toBe('H2');
    expect(title?.textContent?.trim()).toBe('Choose your experience');
    expect(shown?.textContent).toContain('You can change this later in Settings.');
    expect(radio('simple').checked).toBe(false);
    expect(radio('lively').checked).toBe(false);
  });

  it('lets the user continue only after choosing, then keeps the choice on the device and closes', async () => {
    await mountApp(ExperienceDialog);
    expect(continueButton().disabled).toBe(true);

    continueButton().click();
    await flushPromises();
    expect(usePreferencesStore().experience).toBeNull();

    await choose('simple');
    expect(continueButton().disabled).toBe(false);
    continueButton().click();
    await flushPromises();

    expect(usePreferencesStore().experience).toBe('simple');
    expect(window.localStorage.getItem('hopwatch.experience')).toBe('simple');
    const title = document.getElementById('experience-dialog-title');
    expect(title?.closest('.v-overlay--active') ?? null).toBeNull();
  });

  it('does not ask again once the experience is chosen', async () => {
    window.localStorage.setItem('hopwatch.experience', 'lively');
    await mountApp(ExperienceDialog);

    expect(document.getElementById('experience-dialog-title')).toBeNull();
  });

  it('is not dismissed by Escape', async () => {
    await mountApp(ExperienceDialog);

    dialog()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await flushPromises();

    expect(document.getElementById('experience-dialog-title')).not.toBeNull();
    expect(usePreferencesStore().experience).toBeNull();
  });

  describe('keeps keyboard focus inside', () => {
    it('wraps Tab from the last control to the radio group, counted as one stop', async () => {
      await mountApp(ExperienceDialog);
      await choose('lively');
      continueButton().focus();

      const event = tab();

      expect(event.defaultPrevented).toBe(true);
      // The checked radio is the group's tab stop.
      expect(document.activeElement).toBe(radio('lively'));
    });

    it('wraps Shift+Tab from the radio group to the last control', async () => {
      await mountApp(ExperienceDialog);
      await choose('lively');
      radio('lively').focus();

      const event = tab(true);

      expect(event.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(continueButton());
    });

    it('moves Tab from outside the controls to the first stop', async () => {
      await mountApp(ExperienceDialog);
      await choose('lively');
      (document.activeElement as HTMLElement | null)?.blur();
      const card = document.querySelector<HTMLElement>('[role="dialog"] .v-card')!;

      const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
      card.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(radio('lively'));
    });

    it('leaves Tab between inner controls to the browser', async () => {
      await mountApp(ExperienceDialog);
      await choose('lively');
      radio('lively').focus();

      const event = tab();

      expect(event.defaultPrevented).toBe(false);
    });

    it('moves Tab to the first radio while no experience is chosen', async () => {
      await mountApp(ExperienceDialog);
      radio('lively').focus();

      // The Continue button is disabled, so the first radio is also the last stop.
      const event = tab();

      expect(event.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(radio('simple'));
    });
  });
});
