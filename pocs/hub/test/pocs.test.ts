import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { HUB_PORT, POCS, UI_MOCKUP, dependentsOf, hostnameOf, pocUrl } from '../src/pocs';

const pocsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('PoC 레지스트리', () => {
  it('포트·패키지명이 각 앱 package.json 스크립트와 일치한다', () => {
    for (const p of POCS) {
      const pkg = JSON.parse(fs.readFileSync(path.join(pocsDir, p.key, 'package.json'), 'utf8'));
      expect(pkg.name).toBe(p.pkg);
      expect(pkg.scripts.dev).toContain(`--port ${p.port}`);
      expect(pkg.scripts.start).toContain(`--port ${p.port}`);
    }
    const mockup = JSON.parse(fs.readFileSync(path.join(pocsDir, UI_MOCKUP.dir, 'package.json'), 'utf8'));
    expect(mockup.name).toBe(UI_MOCKUP.pkg);
    expect(mockup.scripts.dev).toContain(`--port ${UI_MOCKUP.port}`);
    const ports = [HUB_PORT, ...POCS.map((p) => p.port), UI_MOCKUP.port];
    expect(new Set(ports).size).toBe(ports.length);
  });

  it('선행 PoC는 workspace 의존성으로 선언되어 있다', () => {
    for (const p of POCS) {
      const pkg = JSON.parse(fs.readFileSync(path.join(pocsDir, p.key, 'package.json'), 'utf8'));
      for (const r of p.requires) expect(pkg.dependencies[`@celeber/${r}`]).toBe('workspace:*');
    }
  });

  it('선행관계는 번호 순서를 따르는 비순환 그래프다', () => {
    for (const p of POCS) for (const r of p.requires) expect(POCS.find((x) => x.key === r)!.no).toBeLessThan(p.no);
    expect(dependentsOf('personal-color-report').map((p) => p.key)).toEqual(['celeb-vibe-report']);
  });

  it('주요 화면 경로가 실제 app/ 페이지로 존재한다', () => {
    for (const p of POCS) {
      for (const pg of p.pages) {
        const file = path.join(pocsDir, p.key, 'app', pg.path === '/' ? '' : pg.path, 'page.tsx');
        expect(fs.existsSync(file), `${p.key}${pg.path}`).toBe(true);
      }
    }
  });

  it('Host 헤더에서 호스트 이름만 쓴다', () => {
    expect(hostnameOf('localhost:3100')).toBe('localhost');
    expect(hostnameOf('192.168.0.12:3100')).toBe('192.168.0.12');
    expect(hostnameOf('[::1]:3100')).toBe('[::1]');
    expect(hostnameOf('evil"><script>')).toBe('localhost');
    expect(hostnameOf(null)).toBe('localhost');
    expect(pocUrl({ port: 3105 }, 'localhost:3100', '/new')).toBe('http://localhost:3105/new');
  });
});
