import {createDecartClient, models} from '@decartai/sdk';

const model = models.realtime('lucy-vton-3.6');
let connection = null;

function stop() {
  connection?.disconnect();
  connection = null;
}

async function start({token, stream, garment, prompt, onRemoteStream, onState, onError}) {
  stop();
  const client = createDecartClient({apiKey: token});
  try {
    connection = await client.realtime.connect(stream, {
      model,
      mirror: 'auto',
      resolution: '720p',
      capacityRetryBudgetMs: 20_000,
      onRemoteStream,
      onConnectionChange: onState,
      initialState: {prompt: {text: prompt, enhance: false}, image: garment},
    });
    connection.on('error', onError);
    connection.on('sessionEnded', ({reason}) => {
      const message = reason === 'insufficient_credits'
        ? 'Decart credits are unavailable right now.'
        : 'The live session ended.';
      onError(new Error(message));
    });
    return connection;
  } catch (error) {
    stop();
    throw error;
  }
}

window.RuchsDecart = {start, stop, modelName: model.name};
