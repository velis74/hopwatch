import { useI18n } from 'vue-i18n';

import { type AllauthError, AllauthRequestError } from '../api/allauth';

const CODE_MESSAGES: Record<string, string> = {
  email_password_mismatch: 'auth.errors.invalidCredentials',
  email_taken: 'auth.errors.emailTaken',
  password_too_short: 'auth.errors.passwordTooShort',
  password_too_common: 'auth.errors.passwordTooCommon',
  password_entirely_numeric: 'auth.errors.passwordEntirelyNumeric',
  password_too_similar: 'auth.errors.passwordTooSimilar',
  too_many_login_attempts: 'auth.errors.tooManyAttempts',
};

function messageKey(item: AllauthError): string | undefined {
  if (item.code === 'invalid' && item.param === 'email') return 'auth.errors.invalidEmail';
  return CODE_MESSAGES[item.code];
}

/** Text of a failed allauth request in the interface language; allauth's own message where no translation exists. */
export function useAuthErrorText() {
  const { t } = useI18n();
  return (error: unknown): string => {
    if (!(error instanceof AllauthRequestError) || !error.errors.length) return t('auth.errors.generic');
    return error.errors
      .map((item) => {
        const key = messageKey(item);
        return key ? t(key) : item.message;
      })
      .join(' ');
  };
}
