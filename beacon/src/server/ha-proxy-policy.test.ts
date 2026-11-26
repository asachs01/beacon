import { describe, expect, it } from 'vitest';
import {
  evaluateHaProxyPolicy,
  proxySettingsFromStore,
} from '../../lib/ha-proxy-policy.cjs';

const settings = {
  musicPlayers: ['media_player.living_room', 'media_player.kitchen'],
  toggleEntities: ['light.kitchen', 'switch.fan'],
  privilegeEntities: ['switch.ada_wifi', 'light.desk'],
};

function decision(method: string, path: string, body: unknown = null, scope: object = settings) {
  return evaluateHaProxyPolicy(method, path, body, scope);
}

function expectAllowed(method: string, path: string, body: unknown = null, scope: object = settings) {
  expect(decision(method, path, body, scope)).toEqual({ allowed: true });
}

function expectDenied(method: string, path: string, body: unknown = null, scope: object = settings) {
  expect(decision(method, path, body, scope)).toEqual({
    allowed: false,
    detail: `${method.toUpperCase()} ${path} is not allowed by Beacon`,
  });
}

describe('evaluateHaProxyPolicy reads', () => {
  it('allows the Home Assistant reads the UI uses', () => {
    expectAllowed('GET', '/api/states');
    expectAllowed('GET', '/api/states/weather.home');
    expectAllowed('GET', '/api/states/todo.grocery');
    expectAllowed('GET', '/api/config');
    expectAllowed('GET', '/api/calendars');
    expectAllowed('GET', '/api/calendars/calendar.family?start=2026-11-26T00:00:00.000Z&end=2026-11-27T00:00:00.000Z');
    expectAllowed('GET', '/api/media_source/browse_media');
    const folder = 'media-source://media_source/local/beacon/photos';
    expectAllowed('GET', `/api/media_source/browse_media/${encodeURIComponent(folder)}`);
    expectAllowed('GET', `/api/media_source/browse_media/${encodeURIComponent('media-source://media_source/local/.')}`);
    expectAllowed('GET', `/api/media_source/resolve_media/${encodeURIComponent('media-source://media_source/local/a.jpg')}`);
  });

  it('rejects reads outside that list', () => {
    expectDenied('GET', '/api/config/core/check_config');
    expectDenied('GET', '/api/template');
    expectDenied('GET', '/api/events');
    expectDenied('GET', '/api/services');
    expectDenied('GET', '/api/states/');
    expectDenied('GET', '/api/states/light.kitchen/extra');
    expectDenied('GET', '/api/websocket');
    expectDenied('GET', '/api/media_source/resolve_media');
    expectDenied('GET', '/api/media_source/resolve_media/');
    expectDenied('HEAD', '/api/states');
    expectDenied('PUT', '/api/states/light.kitchen');
    expectDenied('DELETE', '/api/states/light.kitchen');
  });
});

describe('evaluateHaProxyPolicy service calls', () => {
  it('allows the service calls the UI uses', () => {
    expectAllowed('POST', '/api/services/todo/get_items?return_response', { entity_id: 'todo.grocery' });
    expectAllowed('POST', '/api/services/todo/add_item', { entity_id: 'todo.grocery', item: 'Milk' });
    expectAllowed('POST', '/api/services/todo/update_item?return_response=true', { entity_id: 'todo.tasks' });
    expectAllowed('POST', '/api/services/weather/get_forecasts?return_response', { entity_id: 'weather.home', type: 'daily' });
    expectAllowed('POST', '/api/services/conversation/process?return_response', { text: 'what is for dinner' });
    expectAllowed('POST', '/api/services/ai_task/generate_data?return_response', { task_name: 'import' });
    expectAllowed('POST', '/api/services/notify/notify', { title: 'Beacon', message: 'Dinner' });
    expectAllowed('POST', '/api/services/grocy/add_generic', { entity_type: 'shopping_list' });
    expectAllowed('POST', '/api/services/grocy/update_generic', { entity_type: 'shopping_list' });
    expectAllowed('POST', '/api/media_source/local_source/upload', null);
  });

  it('allows media_player playback only for configured players', () => {
    for (const service of [
      'media_play',
      'media_pause',
      'media_play_pause',
      'media_next_track',
      'media_previous_track',
      'volume_set',
      'toggle',
    ]) {
      expectAllowed('POST', `/api/services/media_player/${service}`, {
        entity_id: 'media_player.living_room',
        volume_level: 0.2,
      });
    }
    expectAllowed('POST', '/api/services/media_player/media_play', {
      entity_id: ['media_player.living_room', 'media_player.kitchen'],
    });
    expectAllowed('POST', '/api/services/media_player/volume_set', {
      target: { entity_id: 'media_player.kitchen' },
      volume_level: 0,
    });
  });

  it('allows toggle, turn_on, and turn_off only for configured entities', () => {
    expectAllowed('POST', '/api/services/light/toggle', { entity_id: 'light.kitchen' });
    expectAllowed('POST', '/api/services/switch/toggle', { entity_id: ['switch.fan', 'switch.ada_wifi'] });
    expectAllowed('POST', '/api/services/switch/turn_on', { entity_id: 'switch.ada_wifi' });
    expectAllowed('POST', '/api/services/light/turn_off', { entity_id: 'light.desk' });
    expectAllowed('POST', '/api/services/light/turn_on', { target: { entity_id: 'light.kitchen' } });
  });

  it('denies lock.unlock, homeassistant.restart, script, and shell_command', () => {
    expectDenied('POST', '/api/services/lock/unlock', { entity_id: 'lock.front_door' });
    expectDenied('POST', '/api/services/homeassistant/restart', {});
    expectDenied('POST', '/api/services/script/turn_on', { entity_id: 'script.goodnight' });
    expectDenied('POST', '/api/services/script/reload', {});
    expectDenied('POST', '/api/services/shell_command/reboot', {});
    expectDenied('POST', '/api/services/script/toggle', { entity_id: 'script.goodnight' }, {
      ...settings,
      toggleEntities: ['script.goodnight'],
    });
  });

  it('denies toggle of an entity that is not configured', () => {
    expectDenied('POST', '/api/services/light/toggle', { entity_id: 'light.bedroom' });
    expectDenied('POST', '/api/services/switch/turn_off', { entity_id: 'switch.porch' });
    expectDenied('POST', '/api/services/light/toggle', { entity_id: ['light.kitchen', 'light.bedroom'] });
    expectDenied('POST', '/api/services/light/toggle', {});
    expectDenied('POST', '/api/services/homeassistant/turn_off', {});
  });

  it('denies media_player calls for a player that is not configured', () => {
    expectDenied('POST', '/api/services/media_player/media_play', { entity_id: 'media_player.bedroom' });
    expectDenied('POST', '/api/services/media_player/volume_set', {
      entity_id: ['media_player.living_room', 'media_player.bedroom'],
    });
    expectDenied('POST', '/api/services/media_player/media_pause', {});
    expectDenied('POST', '/api/services/media_player/volume_mute', { entity_id: 'media_player.living_room' });
    expectDenied('POST', '/api/services/media_player/play_media', { entity_id: 'media_player.living_room' });
    expectDenied('POST', '/api/services/media_player/turn_on', { entity_id: 'media_player.living_room' });
    expectDenied('POST', '/api/services/media_player/shuffle_set', { entity_id: 'media_player.living_room' });
    expectDenied('POST', '/api/services/media_player/repeat_set', { entity_id: 'media_player.living_room' });
  });

  it('denies other methods and other Home Assistant endpoints', () => {
    expectDenied('POST', '/api/states', { state: 'on' });
    expectDenied('POST', '/api/states/light.kitchen', { state: 'on' });
    expectDenied('POST', '/api/template', { template: '{{ states("light.kitchen") }}' });
    expectDenied('POST', '/api/config/core/check_config', {});
    expectDenied('POST', '/api/events/beacon_chore_completed', { name: 'dishes' });
    expectDenied('POST', '/api/services/todo/remove_item', { entity_id: 'todo.grocery' });
    expectDenied('POST', '/api/services/calendar/create_event', { entity_id: 'calendar.family' });
    expectDenied('PATCH', '/api/states/light.kitchen', { state: 'off' });
    expectDenied('POST', '/api/services/todo/get_items?return_response=false', { entity_id: 'todo.grocery' });
    expectDenied('POST', '/api/services/light/toggle?entity_id=light.kitchen', { entity_id: 'light.kitchen' });
  });

  it('denies a scoped call that also names an area, device, label, or floor', () => {
    expectDenied('POST', '/api/services/light/toggle', { entity_id: 'light.kitchen', area_id: 'kitchen' });
    expectDenied('POST', '/api/services/media_player/media_play', {
      entity_id: 'media_player.living_room',
      device_id: 'speaker',
    });
    expectDenied('POST', '/api/services/light/turn_off', {
      target: { entity_id: 'light.kitchen', floor_id: 'downstairs' },
    });
  });

  it('does not let an encoded path escape the allowlist', () => {
    expectDenied('POST', '/api/states/%2e%2e/config/core/check_config', {});
    expectDenied('GET', '/api/states/%252e%252e/config');
    expectDenied('POST', '/api/%73ervices/lock/unlock', { entity_id: 'lock.front_door' });
    expectDenied('GET', '/api/config/%2e%2e/core/check_config');
    expectDenied('GET', '/api/media_source/browse_media/%2e%2e/%2e%2e/api/config/core/check_config');
    expectDenied('GET', '/api/media_source/browse_media/%252e%252e%252fsecret');
  });
});

describe('proxySettingsFromStore', () => {
  it('reads music players, toggle cards, and chore-bridge entities', () => {
    const scope = proxySettingsFromStore({
      beaconSettings: {
        musicDefaultPlayer: ' media_player.living_room ',
        musicPlayers: ['media_player.kitchen', 'not an entity'],
      },
      dashboardLayout: {
        version: 3,
        views: [
          {
            regions: {
              topbar: [],
              main: [{
                type: 'ha-toggle',
                config: { entity_ids: ['light.kitchen', 'switch.fan'], entity_id: 'light.ignored' },
              }],
              sidebar: [{ type: 'ha-entity', config: { entity_id: 'sensor.temp' } }],
            },
          },
          {
            regions: {
              topbar: [{ type: 'ha-toggle', config: { entity_id: 'light.legacy' } }],
              main: [{ type: 'ha-entities-list', config: { entity_ids: ['sensor.humidity'] } }],
              sidebar: [],
            },
          },
        ],
      },
      familyMembers: [
        { role: 'child', privilegeEntityId: 'switch.ada_wifi' },
        { role: 'parent', privilegeEntityId: '  ' },
        { role: 'child' },
      ],
    });

    expect(scope).toEqual({
      musicPlayers: ['media_player.living_room', 'media_player.kitchen'],
      toggleEntities: ['light.kitchen', 'switch.fan', 'light.legacy'],
      privilegeEntities: ['switch.ada_wifi'],
    });
  });

  it('reads a pre-views dashboard layout', () => {
    const scope = proxySettingsFromStore({
      beaconSettings: {},
      dashboardLayout: {
        regions: {
          sidebar: [{ type: 'ha-toggle', config: { entity_ids: ['fan.room'] } }],
        },
      },
      familyMembers: [],
    });

    expect(scope.toggleEntities).toEqual(['fan.room']);
    expect(decision('POST', '/api/services/fan/toggle', { entity_id: 'fan.room' }, scope).allowed).toBe(true);
    expect(decision('POST', '/api/services/fan/toggle', { entity_id: 'fan.other' }, scope).allowed).toBe(false);
  });

  it('allows nothing entity-scoped when the store is empty', () => {
    const scope = proxySettingsFromStore({});
    expect(scope).toEqual({ musicPlayers: [], toggleEntities: [], privilegeEntities: [] });
    expect(decision('GET', '/api/states', null, scope).allowed).toBe(true);
    expect(decision('POST', '/api/services/todo/get_items', { entity_id: 'todo.grocery' }, scope).allowed).toBe(true);
    expectDenied('POST', '/api/services/light/toggle', { entity_id: 'light.kitchen' }, scope);
    expectDenied('POST', '/api/services/media_player/media_play', { entity_id: 'media_player.living_room' }, scope);
  });
});
