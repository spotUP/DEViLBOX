import { describe } from 'vitest';
import { ComplianceRunner } from './ComplianceRunner';
import { modCases, xmCases, s3mCases, itCases, legacyCases, envelopeCases, vibratoCases, panningEnvelopeCases, itNNACases } from './cases';

describe('Tracker Compliance Suite', () => {
  // Run all MOD cases
  modCases.forEach(testCase => ComplianceRunner.run(testCase));
  
  // Run all XM cases
  xmCases.forEach(testCase => ComplianceRunner.run(testCase));
  
  // Run all S3M cases
  s3mCases.forEach(testCase => ComplianceRunner.run(testCase));

  // Run all IT cases
  itCases.forEach(testCase => ComplianceRunner.run(testCase));

  // Run all legacy cases
  legacyCases.forEach(testCase => ComplianceRunner.run(testCase));

  // Run all envelope cases
  envelopeCases.forEach(testCase => ComplianceRunner.run(testCase));

  // Run all vibrato cases
  vibratoCases.forEach(testCase => ComplianceRunner.run(testCase));

  // Run all panning envelope cases
  panningEnvelopeCases.forEach(testCase => ComplianceRunner.run(testCase));

  // Run all IT NNA cases
  itNNACases.forEach(testCase => ComplianceRunner.run(testCase));
});
