import { getCalibrationRecommendations } from "./calibrationRecommendations.js";

export function getModelCalibrationSummary(input) {
  const result = getCalibrationRecommendations(input);

  return {
    modelKey: result.modelKey,
    overallPosture: result.overallPosture,
    topIssues: result.topIssues.slice(0, 3),
    strongestRetainedSignals: result.strongestRetainedSignals,
    keyDataGaps: result.keyDataGaps,
    immediateNextStep: result.immediateNextStep,
    recommendations: result.recommendations,
  };
}
