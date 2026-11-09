/**
 * Reads an ORC certificate (PDF or photo) with Claude and returns the
 * extracted fields. The file is sent to the model and not stored anywhere.
 */
import Anthropic from '@anthropic-ai/sdk';
import { CERTIFICATE_PROMPT, CERTIFICATE_SCHEMA, isExtract, type CertificateExtract } from '../src/boat/certificate';
import { HttpError } from './accounts';

export const CERT_MODEL = 'claude-opus-5-5';
/** 10 MB file → base64 is 4/3 of that. */
export const MAX_CERT_BASE64 = Math.ceil((10 * 1024 * 1024 * 4) / 3) + 16;
const TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'] as const;
type MediaType = (typeof TYPES)[number];

export function validateCertificateBody(body: Record<string, unknown>): { data: string; mediaType: MediaType } {
  const data = typeof body.data === 'string' ? body.data : '';
  const mediaType = body.mediaType as MediaType;
  if (!TYPES.includes(mediaType)) throw new HttpError(400, 'Δέχομαι PDF ή φωτογραφία (JPG/PNG).');
  if (!data || !/^[A-Za-z0-9+/]+=*$/.test(data.slice(0, 1000))) throw new HttpError(400, 'Άκυρο αρχείο.');
  if (data.length > MAX_CERT_BASE64) throw new HttpError(413, 'Το αρχείο είναι πάνω από 10 MB.');
  return { data, mediaType };
}

export async function readCertificate(client: Anthropic, file: { data: string; mediaType: MediaType }): Promise<{ extract: CertificateExtract; model: string }> {
  const source =
    file.mediaType === 'application/pdf'
      ? ({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: file.data } } as const)
      : ({ type: 'image', source: { type: 'base64', media_type: file.mediaType, data: file.data } } as const);
  const res = await client.beta.messages.create({
    model: CERT_MODEL,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: CERTIFICATE_SCHEMA as unknown as Record<string, unknown> } },
    system: CERTIFICATE_PROMPT,
    messages: [{ role: 'user', content: [source, { type: 'text', text: 'Διάβασε αυτό το πιστοποιητικό ORC.' }] }],
  });
  if (res.stop_reason === 'refusal') throw new HttpError(502, 'Το AI δεν διάβασε αυτό το αρχείο.');
  if (res.stop_reason === 'max_tokens') throw new HttpError(502, 'Το πιστοποιητικό είναι πολύ μεγάλο για ανάγνωση.');
  const text = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
  let x: unknown;
  try {
    x = JSON.parse(text);
  } catch {
    throw new HttpError(502, 'Μη αναγνώσιμη απάντηση από το AI. Δοκίμασε ξανά.');
  }
  if (!isExtract(x)) throw new HttpError(502, 'Μη αναμενόμενη απάντηση από το AI.');
  if (!x.isCertificate) throw new HttpError(422, 'Δεν μοιάζει με πιστοποιητικό ORC. Έλεγξε το αρχείο.');
  return { extract: x, model: res.model };
}
