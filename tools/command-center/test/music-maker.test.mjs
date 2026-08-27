import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { createMusicMaker, MusicMakerError } from '../music-maker.mjs';

const roots = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function engineRoot(root) {
  return path.join(root, 'tools', 'ace-step-official-v0.1.8');
}

function runtimeTmp(root) {
  return path.join(engineRoot(root), '.cache', 'acestep', 'tmp');
}

function runtimeAudio(root, name = 'result.wav') {
  return path.join(runtimeTmp(root), 'api_audio', name);
}

function audioRef(root, name = 'result.wav') {
  return `/v1/audio?path=${encodeURIComponent(runtimeAudio(root, name))}`;
}

function receiptPath(root, taskId) {
  return path.join(
    root, 'catalog', 'audio', 'song-development', 'record-study',
    'generated', 'ace-step', taskId, 'receipt.json'
  );
}

async function makeRoot({ installed = true, project = true, overrides = {} } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'artistos-music-maker-'));
  roots.push(root);
  if (installed) {
    for (const relative of [
      'tools/ace-step-official-v0.1.8/.venv/Scripts/python.exe',
      'tools/ace-step-official-v0.1.8/acestep/api_server.py'
    ]) {
      const target = path.join(root, relative);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, '', 'utf8');
    }
  }
  if (project) {
    const value = {
      schema: 'artistos-tool-project/1.0',
      id: 'record-study-1234abcd',
      title: 'Record Study',
      engine: 'ace',
      settings: {
        task: 'text2music',
        model: 'acestep-v15-turbo',
        caption: 'Physical electronic soul with an evolving hook',
        lyrics: '[Verse]\nBuilt to return',
        durationSeconds: 30,
        bpm: 120,
        key: 'F# minor',
        timeSignature: 4,
        seed: 89,
        sourceAudioPath: '',
        repaintStart: 0,
        repaintEnd: 10,
        ...overrides
      },
      boundaries: { approved: false, published: false }
    };
    const target = path.join(root, 'catalog', 'operations', 'tool-projects', `${value.id}.json`);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  }
  return root;
}

function spawnRecorder(calls) {
  return (command, args, options) => {
    calls.push({ command, args, options });
    const child = new EventEmitter();
    child.pid = 89;
    child.unref = () => {};
    queueMicrotask(() => child.emit('spawn'));
    return child;
  };
}

describe('first-party Music Maker adapter', () => {
  it('keeps an absent ACE pack optional and exposes sanitized fail-closed boundaries', async () => {
    const root = await makeRoot({ installed: false, project: false });
    const maker = createMusicMaker({ workspaceRoot: root, probeImpl: async () => false });
    const observed = await maker.observe();
    assert.equal(observed.schema, 'artistos-music-maker/1.0');
    assert.equal(observed.engine.status, 'absent');
    assert.equal(observed.engine.origin, 'http://127.0.0.1:8001');
    assert.equal(observed.boundaries.gradio, false);
    assert.equal(observed.boundaries.audioDownloadRouteOnly, true);
    assert.equal(observed.boundaries.repaint.enabled, false);
    assert.match(observed.boundaries.repaint.reason, /normalization/i);
    assert.equal(JSON.stringify(observed).includes(root), false);
  });

  it('launches only the fixed API server with locked local runtime and model environment', async () => {
    const root = await makeRoot({ project: false });
    const calls = [];
    const maker = createMusicMaker({
      workspaceRoot: root,
      spawnImpl: spawnRecorder(calls),
      probeImpl: async () => false,
      randomBytesImpl: () => Buffer.alloc(32, 7)
    });
    await assert.rejects(
      () => maker.launch(),
      (error) => error instanceof MusicMakerError && error.status === 400 && /confirmation/.test(error.message)
    );
    const launched = await maker.launch({ confirmed: true });
    assert.equal(launched.launched, true);
    assert.equal(calls.length, 1);
    const call = calls[0];
    assert.equal(call.command, path.join(engineRoot(root), '.venv', 'Scripts', 'python.exe'));
    assert.deepEqual(call.args, ['-m', 'acestep.api_server', '--host', '127.0.0.1', '--port', '8001']);
    assert.equal(call.options.cwd, engineRoot(root));
    assert.equal(call.options.detached, true);
    assert.equal(call.options.windowsHide, true);
    assert.equal(call.options.env.ACESTEP_API_HOST, '127.0.0.1');
    assert.equal(call.options.env.ACESTEP_API_PORT, '8001');
    assert.equal(call.options.env.ACESTEP_API_WORKERS, '1');
    assert.equal(call.options.env.ACESTEP_QUEUE_WORKERS, '1');
    assert.equal(call.options.env.ACESTEP_CONFIG_PATH, 'acestep-v15-turbo');
    assert.equal(call.options.env.ACESTEP_CONFIG_PATH2, 'acestep-v15-sft');
    assert.equal(call.options.env.ACESTEP_CONFIG_PATH3, '');
    assert.equal(call.options.env.ACESTEP_LM_MODEL_PATH, 'acestep-5Hz-lm-0.6B');
    assert.equal(call.options.env.ACESTEP_LM_BACKEND, 'pt');
    assert.equal(call.options.env.ACESTEP_TMPDIR, runtimeTmp(root));
    assert.equal(call.options.env.TEMP, runtimeTmp(root));
    assert.equal(call.options.env.TMP, runtimeTmp(root));
    assert.equal(call.options.env.TMPDIR, runtimeTmp(root));
    assert.equal(call.options.env.TRITON_CACHE_DIR.startsWith(engineRoot(root)), true);
    assert.equal(call.options.env.TORCHINDUCTOR_CACHE_DIR.startsWith(engineRoot(root)), true);
    assert.equal(call.options.env.ACESTEP_API_KEY.length >= 32, true);
    assert.equal(JSON.stringify(launched).includes(call.options.env.ACESTEP_API_KEY), false);
    assert.equal(JSON.stringify(launched).includes(root), false);
  });

  it('uses the official authenticated audio route and atomically records downloaded bytes', async () => {
    const root = await makeRoot();
    const calls = [];
    const generatedBytes = Buffer.from('generated-wave-bytes');
    const fetchImpl = async (url, options) => {
      calls.push({ url, options });
      if (url.endsWith('/release_task')) {
        const request = JSON.parse(options.body);
        assert.equal(request.task_type, 'text2music');
        assert.equal(request.use_cot_caption, false);
        assert.equal(request.use_cot_language, false);
        assert.equal(request.use_format, false);
        assert.equal(request.is_format_caption, false);
        assert.equal(request.sample_mode, false);
        return jsonResponse({ code: 200, data: { task_id: 'job_89', status: 'queued' } });
      }
      if (url.endsWith('/query_result')) {
        assert.deepEqual(JSON.parse(options.body), { task_id_list: ['job_89'] });
        return jsonResponse({
          code: 200,
          data: [{ task_id: 'job_89', status: 1, result: JSON.stringify([{ file: audioRef(root) }]) }]
        });
      }
      assert.equal(new URL(url).origin, 'http://127.0.0.1:8001');
      assert.equal(new URL(url).pathname, '/v1/audio');
      return new Response(generatedBytes, { status: 200, headers: { 'Content-Type': 'audio/wav' } });
    };
    const maker = createMusicMaker({
      workspaceRoot: root,
      fetchImpl,
      probeImpl: async () => true,
      sleepImpl: async () => {},
      randomBytesImpl: () => Buffer.alloc(32, 9)
    });
    const result = await maker.generate({ projectId: 'record-study-1234abcd', confirmed: true });
    assert.equal(result.status, 'succeeded');
    assert.equal(calls.length, 3);
    assert.equal(calls[0].url, 'http://127.0.0.1:8001/release_task');
    assert.equal(calls[1].url, 'http://127.0.0.1:8001/query_result');
    assert.equal(new URL(calls[2].url).pathname, '/v1/audio');
    const authorization = calls[0].options.headers.Authorization;
    assert.equal(authorization.startsWith('Bearer '), true);
    assert.equal(calls[1].options.headers.Authorization, authorization);
    assert.equal(calls[2].options.headers.Authorization, authorization);
    assert.equal(calls[2].options.method, 'GET');
    assert.equal(result.outputs[0].sha256, createHash('sha256').update(generatedBytes).digest('hex'));
    assert.equal(await readFile(path.join(root, result.outputs[0].path), 'utf8'), generatedBytes.toString());
    const receipt = JSON.parse(await readFile(path.join(root, result.receiptPath), 'utf8'));
    assert.equal(receipt.status, 'succeeded');
    assert.equal(receipt.outputs[0].sha256, result.outputs[0].sha256);
    assert.deepEqual(receipt.boundaries, {
      artistSelected: false, master: false, approved: false, released: false, published: false
    });
    const observed = await maker.observe();
    assert.equal(observed.jobs[0].status, 'succeeded');
    assert.equal(JSON.stringify(observed).includes(root), false);
    assert.equal(JSON.stringify(observed).includes(authorization.slice('Bearer '.length)), false);
  });

  it('uploads a validated cover source through multipart without persisting its absolute path', async () => {
    const root = await makeRoot({ overrides: { task: 'cover', sourceAudioPath: 'catalog/audio/source.wav' } });
    const sourcePath = path.join(root, 'catalog', 'audio', 'source.wav');
    await mkdir(path.dirname(sourcePath), { recursive: true });
    await writeFile(sourcePath, 'owned-source-audio', 'utf8');
    let submittedForm;
    const fetchImpl = async (url, options) => {
      if (url.endsWith('/release_task')) {
        assert.equal(options.body instanceof FormData, true);
        assert.equal(Object.keys(options.headers).some((key) => key.toLowerCase() === 'content-type'), false);
        submittedForm = options.body;
        const uploaded = submittedForm.get('src_audio');
        assert.equal(uploaded instanceof Blob, true);
        assert.equal(uploaded.name, 'source.wav');
        assert.equal(await uploaded.text(), 'owned-source-audio');
        assert.equal(submittedForm.get('src_audio_path'), null);
        assert.equal(submittedForm.get('task_type'), 'cover');
        assert.equal(submittedForm.get('use_cot_caption'), 'false');
        assert.equal([...submittedForm.values()].some((value) => typeof value === 'string' && value.includes(root)), false);
        return jsonResponse({ code: 200, data: { task_id: 'cover-job' } });
      }
      if (url.endsWith('/query_result')) {
        return jsonResponse({
          code: 200,
          data: [{ task_id: 'cover-job', status: 1, result: JSON.stringify([{ file: audioRef(root, 'cover.wav') }]) }]
        });
      }
      return new Response(Buffer.from('covered-audio'), { status: 200 });
    };
    const maker = createMusicMaker({ workspaceRoot: root, fetchImpl, probeImpl: async () => true });
    const result = await maker.generate({ projectId: 'record-study-1234abcd', confirmed: true });
    const receipt = JSON.parse(await readFile(path.join(root, result.receiptPath), 'utf8'));
    assert.equal(receipt.source.path, 'catalog/audio/source.wav');
    assert.equal(receipt.source.sha256, createHash('sha256').update('owned-source-audio').digest('hex'));
    assert.equal(Object.hasOwn(receipt.request, 'src_audio_path'), false);
    assert.equal(JSON.stringify(receipt).includes(root), false);
    assert.equal(JSON.stringify(receipt).includes(runtimeTmp(root)), false);
  });

  it('fails closed for repaint before any ACE API request', async () => {
    const root = await makeRoot({
      overrides: { task: 'repaint', sourceAudioPath: 'catalog/audio/source.wav', repaintStart: 4, repaintEnd: 8 }
    });
    const sourcePath = path.join(root, 'catalog', 'audio', 'source.wav');
    await mkdir(path.dirname(sourcePath), { recursive: true });
    await writeFile(sourcePath, 'owned-source-audio', 'utf8');
    let apiCalls = 0;
    const maker = createMusicMaker({
      workspaceRoot: root,
      fetchImpl: async () => { apiCalls += 1; throw new Error('must not be called'); },
      probeImpl: async () => true
    });
    await assert.rejects(
      () => maker.generate({ projectId: 'record-study-1234abcd', confirmed: true }),
      (error) => error instanceof MusicMakerError && error.status === 409 && /strict bounded preservation/.test(error.message)
    );
    assert.equal(apiCalls, 0);
    assert.equal((await maker.observe()).boundaries.repaint.enabled, false);
  });

  it('rejects foreign, wrong-route, and runtime-escaping audio references without downloading them', async () => {
    const cases = [
      (root) => `https://example.invalid/v1/audio?path=${encodeURIComponent(runtimeAudio(root))}`,
      (root) => `http://127.0.0.1:8001/health?path=${encodeURIComponent(runtimeAudio(root))}`,
      () => `http://127.0.0.1:8001/v1/audio?path=${encodeURIComponent(path.join(os.tmpdir(), 'escaped.wav'))}`
    ];
    for (let index = 0; index < cases.length; index += 1) {
      const root = await makeRoot();
      const taskId = `bad_ref_${index}`;
      let calls = 0;
      const fetchImpl = async (url) => {
        calls += 1;
        if (url.endsWith('/release_task')) return jsonResponse({ code: 200, data: { task_id: taskId } });
        if (url.endsWith('/query_result')) {
          return jsonResponse({
            code: 200,
            data: [{ task_id: taskId, status: 1, result: JSON.stringify([{ file: cases[index](root) }]) }]
          });
        }
        throw new Error('disallowed reference must not be fetched');
      };
      const maker = createMusicMaker({ workspaceRoot: root, fetchImpl, probeImpl: async () => true });
      await assert.rejects(
        () => maker.generate({ projectId: 'record-study-1234abcd', confirmed: true }),
        (error) => error instanceof MusicMakerError && error.status === 502
      );
      assert.equal(calls, 2);
      const receipt = JSON.parse(await readFile(receiptPath(root, taskId), 'utf8'));
      assert.equal(receipt.status, 'failed');
      assert.equal(receipt.outputs.length, 0);
      assert.equal((await maker.observe()).jobs[0].status, 'failed');
    }
  });

  it('enforces the download byte cap and leaves a terminal failed receipt without partial audio', async () => {
    const root = await makeRoot();
    const taskId = 'oversize_job';
    const fetchImpl = async (url) => {
      if (url.endsWith('/release_task')) return jsonResponse({ code: 200, data: { task_id: taskId } });
      if (url.endsWith('/query_result')) {
        return jsonResponse({
          code: 200,
          data: [{ task_id: taskId, status: 1, result: JSON.stringify([{ file: audioRef(root, 'large.wav') }]) }]
        });
      }
      return new Response(Buffer.from('five!'), { status: 200 });
    };
    const maker = createMusicMaker({
      workspaceRoot: root,
      fetchImpl,
      probeImpl: async () => true,
      maxDownloadBytes: 4
    });
    await assert.rejects(
      () => maker.generate({ projectId: 'record-study-1234abcd', confirmed: true }),
      (error) => error instanceof MusicMakerError && error.status === 502 && /size limit/.test(error.message)
    );
    const receipt = JSON.parse(await readFile(receiptPath(root, taskId), 'utf8'));
    assert.equal(receipt.status, 'failed');
    assert.equal(receipt.outputs.length, 0);
    await assert.rejects(
      () => access(path.join(path.dirname(receiptPath(root, taskId)), 'audio-01.wav')),
      (error) => error.code === 'ENOENT'
    );
    assert.equal((await maker.observe()).jobs[0].status, 'failed');
  });
});
