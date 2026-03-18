import { createNormalizedHttpError } from '@/network/errors';
import {
  DEFAULT_SERVER_ERROR_MESSAGE,
  NETWORK_ERROR_MESSAGE,
  TIMEOUT_ERROR_MESSAGE,
} from '@/network/errors';
import {
  isVisibleExternalOrderError,
  resolveExternalOrderErrorPresentation,
} from '@/order/external-errors';
import { externalOrderErrorContract } from '../../fixtures/external-order-error-contract';

describe('mobile external order errors', () => {
  it.each(externalOrderErrorContract.cases)(
    'maps contract case $codes/$operatorCode with parity',
    (contractCase) => {
      const code = contractCase.codes?.[0];
      const error = createNormalizedHttpError(contractCase.message, {
        code,
        operatorCode: contractCase.operatorCode,
        retryAfterSeconds: contractCase.retryAfterSeconds,
        traceId: 'trace-contract-001',
      });
      const presentation = resolveExternalOrderErrorPresentation(error);

      expect(isVisibleExternalOrderError(error)).toBe(true);
      expect(presentation.reasonCategory).toBe(contractCase.reasonCategory);
      expect(presentation.reasonCategoryLabel).toBe('대외');
      expect(presentation.semantic).toBe(contractCase.semantic);
      expect(presentation.recoveryAction).toBe(contractCase.recoveryAction);
      expect(presentation.severity).toBe(contractCase.severity);
      expect(presentation.title).toBe(contractCase.title);
      expect(presentation.message).toBe(contractCase.message);
      expect(presentation.nextStep).toBe(contractCase.nextStep);
      expect(presentation.supportReference).toBe(
        `${externalOrderErrorContract.supportReferenceLabel}: trace-contract-001`,
      );
    },
  );

  it('falls back to unknown guidance without claiming completion', () => {
    const presentation = resolveExternalOrderErrorPresentation(
      createNormalizedHttpError('Unknown external state', {
        code: 'FEP-999',
        operatorCode: 'UNKNOWN_EXTERNAL_STATE',
        traceId: 'trace-unknown-001',
      }),
    );

    expect(presentation.semantic).toBe(
      externalOrderErrorContract.unknownFallback.semantic,
    );
    expect(presentation.reasonCategory).toBe(
      externalOrderErrorContract.unknownFallback.reasonCategory,
    );
    expect(presentation.title).toBe(externalOrderErrorContract.unknownFallback.title);
    expect(presentation.nextStep).toBe(
      externalOrderErrorContract.unknownFallback.nextStep,
    );
  });

  it.each([
    DEFAULT_SERVER_ERROR_MESSAGE,
    NETWORK_ERROR_MESSAGE,
    TIMEOUT_ERROR_MESSAGE,
  ])('treats transport failures as visible retry guidance: %s', (message) => {
    expect(isVisibleExternalOrderError(createNormalizedHttpError(message))).toBe(true);
  });

  it('keeps non-external application errors out of the visible contract', () => {
    expect(
      isVisibleExternalOrderError(
        createNormalizedHttpError('Invalid order payload', {
          code: 'ORD-006',
        }),
      ),
    ).toBe(false);
  });
});
