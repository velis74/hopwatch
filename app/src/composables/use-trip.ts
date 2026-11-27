import { type Ref, ref, watch } from 'vue';

import { type Trip, trip as fetchTrip } from '../api/hopwatch-api';

import { type RefreshScheduler, useRefreshScheduler } from './use-refresh-scheduler';

export interface TripState {
  trip: Ref<Trip | null>;
  /** The latest load failed. */
  error: Ref<boolean>;
  /** The ride does not exist (any more). */
  notFound: Ref<boolean>;
  /** Milliseconds since the epoch of the latest successful load. */
  updatedAt: Ref<number | null>;
  scheduler: RefreshScheduler;
}

/** Loads the ride `tripId` and refreshes it with the refresh scheduler; `onLoad` gets the previous and the new ride. */
export function useTrip(tripId: Ref<string | null>, onLoad?: (previous: Trip | null, next: Trip) => void): TripState {
  const trip = ref<Trip | null>(null);
  const error = ref(false);
  const notFound = ref(false);
  const updatedAt = ref<number | null>(null);
  let sequence = 0;

  async function load(): Promise<void> {
    const id = tripId.value;
    if (!id) return;
    const current = ++sequence;
    try {
      const result = await fetchTrip(id);
      if (current !== sequence) return;
      onLoad?.(trip.value, result);
      trip.value = result;
      error.value = false;
      notFound.value = false;
      updatedAt.value = scheduler.now.value;
    } catch (failure) {
      if (current !== sequence) return;
      error.value = true;
      notFound.value = (failure as { response?: { status?: number } }).response?.status === 404;
    }
  }

  const scheduler = useRefreshScheduler(load);

  watch(
    tripId,
    () => {
      trip.value = null;
      error.value = false;
      notFound.value = false;
      updatedAt.value = null;
      scheduler.loadNow();
    },
    { immediate: true },
  );

  return { trip, error, notFound, updatedAt, scheduler };
}
