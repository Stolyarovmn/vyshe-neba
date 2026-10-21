// Which destinations the launch screen may offer, with the reasons for the closed ones.

import { DESTINATIONS } from '../data/index.js';
import { unmetRequirements } from './common.js';

export function availableDestinations(profile) {
  return Object.values(DESTINATIONS).map((destination) => {
    const reasons = unmetRequirements(profile, destination.requires);
    return { id: destination.id, name: destination.name, desc: destination.desc, ok: reasons.length === 0, reasons };
  });
}

export function isDestinationOpen(profile, id) {
  return availableDestinations(profile).some((destination) => destination.id === id && destination.ok);
}
