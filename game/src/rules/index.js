// Single entry point of the rules package. All functions are pure and never mutate their arguments.

export { getPartState, buyPart, getBuildingState, buyBuilding, partPrice, buildingPrice } from './purchases.js';
export { getNextSteps, kmText } from './next-steps.js';
export { getEraState, advanceEra, countBuildingsAtLevel } from './eras.js';
export { powerBalance, deriveBase } from './base.js';
export { deriveRocket, makeFlightConfig, resolveConsumables } from './rocket.js';
export { settleFlight, partsValue, crashLoss, travelPay } from './settle.js';
export { availableDestinations, isDestinationOpen } from './destinations.js';
export { listContracts, refillContracts, contractSlots } from './contracts.js';
export { checkAchievements, applyProgress } from './progress.js';
export { conditionProgress, evalCondition, evalGoal } from './goals.js';
export { buyConsumable, buySkin, selectSkin } from './shop.js';
