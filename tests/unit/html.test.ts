import { describe, expect, it } from 'vitest';
import { escapeHtml } from '~/lib/html';

describe('escapeHtml', () => {
  it('neutralizza i tag e gli attributi', () => {
    expect(escapeHtml('<img src=x onerror="alert(1)">')).toBe(
      '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;',
    );
  });

  it("gestisce & e l'apostrofo italiano", () => {
    expect(escapeHtml("Tom & l'Urlo")).toBe('Tom &amp; l&#39;Urlo');
  });

  it('lascia invariato il testo normale, accenti compresi', () => {
    expect(escapeHtml('Chissà chi verrà')).toBe('Chissà chi verrà');
  });
});
