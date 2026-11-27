import { type ApiErrorBody, errorBodyOf } from '@dynamicforms/fastapi-viewsets';
import { useI18n } from 'vue-i18n';

const CODE_MESSAGES: Record<string, string> = {
  'hopwatch.email_password_mismatch': 'auth.errors.invalidCredentials',
  'hopwatch.email_taken': 'auth.errors.emailTaken',
  'hopwatch.password_too_short': 'auth.errors.passwordTooShort',
  'hopwatch.password_too_common': 'auth.errors.passwordTooCommon',
  'hopwatch.password_entirely_numeric': 'auth.errors.passwordEntirelyNumeric',
  'hopwatch.password_too_similar': 'auth.errors.passwordTooSimilar',
  'hopwatch.too_many_login_attempts': 'auth.errors.tooManyAttempts',
  'hopwatch.too_many_requests': 'auth.errors.tooManyAttempts',
};

function messageKey(field: string, code: string): string | undefined {
  if (code === 'fastapi-viewsets.invalid' && field === 'email') return 'auth.errors.invalidEmail';
  return CODE_MESSAGES[code];
}

/** The failures of an error body: its field errors, else the error itself; empty for an unexpected answer. */
function failures(body: ApiErrorBody): { field: string; code: string; detail: string }[] {
  const fields = Object.entries(body.field_errors).flatMap(([field, errors]) =>
    errors.map((error) => ({ field, code: error.code, detail: error.detail })),
  );
  if (fields.length) return fields;
  return CODE_MESSAGES[body.detail_code] ? [{ field: '', code: body.detail_code, detail: body.detail }] : [];
}

/** Text of a failed account call in the interface language; the server's message where no translation exists. */
export function useAuthErrorText() {
  const { t } = useI18n();
  return (error: unknown): string => {
    const found = failures(errorBodyOf(error));
    if (!found.length) return t('auth.errors.generic');
    return found
      .map(({ field, code, detail }) => {
        const key = messageKey(field, code);
        return key ? t(key) : detail;
      })
      .join(' ');
  };
}
