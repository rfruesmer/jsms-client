import { getLogger } from "@log4js-node/log4js-api";
import { createServer, IncomingMessage, request as createRequest, RequestOptions } from "http";
import { JsQueueReceiver } from "../../src/internal/js-queue-receiver";
import { JsQueueSender } from "../../src/internal/js-queue-sender";
import { JsmsConnection } from "../../src/jsms-connection";
import { JsmsDeferred } from "../../src/jsms-deferred";
import { JsmsMessage } from "../../src/jsms-message";
import { JsmsQueue } from "../../src/jsms-queue";
import { JsmsTopic } from "../../src/jsms-topic";

const logger = getLogger("HttpConnection");
logger.level = "debug";

export class HttpConnection extends JsmsConnection {
    private brokerHost: string;
    private brokerPort: number;
    private deferredResponses = new Map<string, JsmsDeferred<JsmsMessage>>();
    private requestOptions: RequestOptions; 

    constructor(brokerHost: string, brokerPort: number, localPort: number = 0) {
        super();

        this.brokerHost = brokerHost;
        this.brokerPort = brokerPort;
        this.requestOptions = {
            host: this.brokerHost,
            port: this.brokerPort,
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            }
        };

        if (localPort > 0) {
            this.listen(localPort);
        }
    }

    private listen(port: number): void {
        createServer(this.onRequest).listen(port, () => {
            logger.info(`HttpConnection listening on port ${port}`);
        });
    }

    private onRequest = (request: any, response: any) => {
        this.getJSONDataFromRequestStream(request).then(message => {
            this.onMessage(message).then(responseMessage => {
                response.write(responseMessage.toString());
                response.end();
            })
            .catch(reason => {
                logger.warn(reason);
            });
        });
    }

    private getJSONDataFromRequestStream(request: IncomingMessage): Promise<JsmsMessage> {
        return new Promise(resolve => {
            const chunks: any = [];
            request.on("data", (chunk) => {
                chunks.push(chunk);
            })
            .on("end", () => {
                const requestString = Buffer.concat(chunks).toString();
                const requestMessage = JsmsMessage.fromString(requestString);
                resolve(requestMessage);
            });
        });
    }

    private onMessage(message: JsmsMessage): JsmsDeferred<JsmsMessage> {
        const destination = super.getDestinationFor(message.header.channel);
        const consumer = super.getConsumer(destination);

        return consumer.onMessage(message);
    }

    // TODO: pull-up
    public createQueue(queueName: string): JsmsQueue {
        const queue = new JsmsQueue(queueName);
        super.addQueue(queue, new JsQueueSender(this, queue), new JsQueueReceiver(this, queue));
        
        return queue;
    }    

    public send(message: JsmsMessage): JsmsDeferred<JsmsMessage> {
        const deferredResponse = this.sendRequest(message);

        if (message.header.expiration > 0) {
            const timeToLive = message.header.expiration - new Date().getTime();
            setTimeout(() => {
                this.deferredResponses.delete(message.header.id);
                deferredResponse.reject("message expired");
            }, timeToLive);
        }

        return deferredResponse;
    }

    private sendRequest(message: JsmsMessage): JsmsDeferred<JsmsMessage> {
        const deferredResponse = new JsmsDeferred<JsmsMessage>();
        this.deferredResponses.set(message.header.id, deferredResponse);

        const request = createRequest(this.requestOptions, response => {
            if (!response) {
                return;
            }

            const { statusCode } = response;
            if (statusCode && statusCode >= 300) {
                deferredResponse.reject(new Error(response.statusMessage));
            }

            const chunks: any = [];
            response.on("data", (chunk) => {
                chunks.push(chunk);
            })
            .on("end", () => {
                const result = JSON.parse(Buffer.concat(chunks).toString());
                deferredResponse.resolve(result);
            });
        });

        request.on("error", (e) => {
            // NOTE: still need to handle errors and/or retries here ...
            logger.error(e);
        });

        request.write(message.toString());
        request.end();

        return deferredResponse;
    }
 
    // TODO: pull-up
    public createTopic(topicName: string): JsmsTopic {
        throw new Error("Method not implemented.");
    }
}