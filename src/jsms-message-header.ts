import { v4 } from "uuid";

/**
 *  Header fields contain values used by both clients and providers to identify 
 *  and route messages.
 */
export class JsmsMessageHeader {
    public readonly id: string;
    public readonly channel: string;
    public readonly expiration: number;
    public readonly correlationID: string;

    /**
     * @param id            This message's unique id
     * @param channel       The topic or queue name.
     * @param expiration    The time in milliseconds when this message will expire
     *                      or 0 if the message shouldn't expire.
     * @param correlationID Used for matching replies/responses to original message.
     */
    constructor(id: string, channel: string, expiration: number, correlationID: string) {
        this.id = id;
        this.channel = channel;
        this.expiration = expiration;
        this.correlationID = correlationID;
    }
}
