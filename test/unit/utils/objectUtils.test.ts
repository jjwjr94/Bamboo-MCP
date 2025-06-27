import { describe, expect, it } from 'vitest';
import { convertKeysToSnakeCase } from '../../../src/utils/objectUtils.js';

describe('convertKeysToSnakeCase', () => {
  it('should handle standard camelCase keys', () => {
    const input = { myTestKey: 1, anotherKey: 'value' };
    const expected = { my_test_key: 1, another_key: 'value' };
    expect(convertKeysToSnakeCase(input)).toEqual(expected);
  });

  it('should handle acronyms correctly', () => {
    const input = {
      httpRequest: 'test',
      xmlHttpRequest: 'test2',
      apiKey: 'secret',
      userID: 123,
      HTTPToXML: 'conversion',
    };
    const expected = {
      http_request: 'test',
      xml_http_request: 'test2',
      api_key: 'secret',
      user_id: 123,
      http_to_xml: 'conversion',
    };
    expect(convertKeysToSnakeCase(input)).toEqual(expected);
  });

  it('should handle nested objects and arrays', () => {
    const input = {
      userId: 1,
      apiData: [{ pageId: 10, pageName: 'Test' }],
      nestedObject: {
        firstName: 'John',
        lastName: 'Doe',
        contactInfo: { emailAddress: 'john@example.com' },
      },
    };
    const expected = {
      user_id: 1,
      api_data: [{ page_id: 10, page_name: 'Test' }],
      nested_object: {
        first_name: 'John',
        last_name: 'Doe',
        contact_info: { email_address: 'john@example.com' },
      },
    };
    expect(convertKeysToSnakeCase(input)).toEqual(expected);
  });

  it('should preserve primitive values unchanged', () => {
    expect(convertKeysToSnakeCase('string')).toBe('string');
    expect(convertKeysToSnakeCase(123)).toBe(123);
    expect(convertKeysToSnakeCase(true)).toBe(true);
    expect(convertKeysToSnakeCase(null)).toBe(null);
    expect(convertKeysToSnakeCase(undefined)).toBe(undefined);
  });

  it('should preserve non-plain objects (Date, RegExp, etc.)', () => {
    const date = new Date('2023-01-01');
    const regex = /test/g;
    const input = { testDate: date, testRegex: regex };
    const result = convertKeysToSnakeCase(input);

    // Keys should be converted, but the objects themselves should be preserved
    expect(Object.keys(result)).toEqual(['test_date', 'test_regex']);
    expect(result.test_date).toBeInstanceOf(Date);
    expect(result.test_regex).toBeInstanceOf(RegExp);
    // The actual objects should be the same instances
    expect(result.test_date).toBe(date);
    expect(result.test_regex).toBe(regex);
  });

  it('should handle empty objects and arrays', () => {
    expect(convertKeysToSnakeCase({})).toEqual({});
    expect(convertKeysToSnakeCase([])).toEqual([]);
    expect(convertKeysToSnakeCase({ emptyArray: [], emptyObject: {} })).toEqual({
      empty_array: [],
      empty_object: {},
    });
  });

  it('should handle Meta API targeting structure correctly', () => {
    const input = {
      geoLocations: {
        countries: ['US', 'CA'],
        regions: [{ key: 'US-CA' }],
      },
      ageMin: 18,
      ageMax: 65,
      customAudiences: [{ id: '123' }],
      flexibleSpec: [
        {
          interests: [{ id: '456', name: 'Technology' }],
        },
      ],
    };
    const expected = {
      geo_locations: {
        countries: ['US', 'CA'],
        regions: [{ key: 'US-CA' }],
      },
      age_min: 18,
      age_max: 65,
      custom_audiences: [{ id: '123' }],
      flexible_spec: [
        {
          interests: [{ id: '456', name: 'Technology' }],
        },
      ],
    };
    expect(convertKeysToSnakeCase(input)).toEqual(expected);
  });

  it('should handle creative features spec structure correctly', () => {
    const input = {
      standardEnhancements: {
        enrollStatus: 'OPT_IN',
      },
    };
    const expected = {
      standard_enhancements: {
        enroll_status: 'OPT_IN',
      },
    };
    expect(convertKeysToSnakeCase(input)).toEqual(expected);
  });

  it('should handle circular references safely', () => {
    interface Circular {
      key: string;
      circular?: Circular;
    }
    const obj: Circular = { key: 'value' };
    obj.circular = obj;

    const result = convertKeysToSnakeCase(obj);
    expect(result.key).toBe('value');
    expect(result.circular).toEqual({});
  });
});
