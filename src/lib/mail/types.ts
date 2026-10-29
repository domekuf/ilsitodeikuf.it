export type MailMessage = {
  to: string;
  from: string;
  replyTo?: string | undefined;
  subject: string;
  html: string;
  text: string;
};

export interface MailProvider {
  readonly name: string;
  send(message: MailMessage): Promise<void>;
}

/** "Nome <email@x>" → { name, email } */
export function parseAddress(value: string): { name?: string; email: string } {
  const m = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(value);
  return m?.[2]
    ? { ...(m[1] ? { name: m[1].replace(/^"|"$/g, '') } : {}), email: m[2] }
    : { email: value.trim() };
}
