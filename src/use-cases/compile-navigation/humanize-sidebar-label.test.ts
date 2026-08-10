import { describe, expect, it } from 'vitest';
import { humanizeSidebarLabel } from './humanize-sidebar-label.js';

describe('humanizeSidebarLabel', () => {
  it.each([
    ['runtime-systems', 'Runtime Systems'],
    ['data-and-analytics', 'Data and Analytics'],
    ['oauth-and-oidc', 'OAuth and OIDC'],
    ['api-and-sdk', 'API and SDK'],
    ['graphql', 'GraphQL'],
    ['opentelemetry', 'OpenTelemetry'],
    ['sqlite', 'SQLite'],
    ['ios-and-tvos', 'iOS and tvOS'],
    ['ci-cd', 'CI/CD'],
    ['nodejs', 'Node.js'],
    ['openapi-spec', 'OpenAPI Spec'],
    ['postgresql', 'PostgreSQL'],
    ['typescript-and-webassembly', 'TypeScript and WebAssembly'],
    ['aspnet-and-csharp', 'ASP.NET and C#'],
    ['cpp', 'C++'],
    ['unknown-software-area', 'Unknown Software Area'],
  ])('humanizes %s as %s', (input, expected) => {
    expect(humanizeSidebarLabel(input)).toBe(expected);
  });

  it('preserves meaningful source casing in unknown terms', () => {
    expect(humanizeSidebarLabel('SparkDataStream')).toBe('SparkDataStream');
  });
});
