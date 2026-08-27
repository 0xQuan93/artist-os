import { Config } from '@remotion/cli/config';

Config.setCodec('h264');
Config.setChromeMode('chrome-for-testing');
Config.setConcurrency(2);
Config.setDelayRenderTimeoutInMilliseconds(120_000);
Config.setPixelFormat('yuv420p');
Config.setVideoImageFormat('jpeg');
