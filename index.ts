#!/usr/bin/env node

import * as fs from "fs";

import * as Commander from "commander";
import * as DateFns from "date-fns";
import * as lodash from "lodash";
import * as Twitter from "twitter";

import DailyTweetCount from "./dailyTweetCount";
import GetUserTimeLineOptions from "./getUserTimeLineOptions";
import Tweet from "./tweet";

import Stub from "./stub";

Commander
    .option("--screen-name <screen-name>")
    .option("--create-stub")
    .option("--use-stub")
    .parse(process.argv);

let client: { get };

if (Commander.useStub) {
    client = Stub;
}
else {
    client = new Twitter({
        access_token_key: process.env.TWITTER_ACCESS_TOKEN_KEY,
        access_token_secret: process.env.TWITTER_ACCESS_TOKEN_SECRET,
        consumer_key: process.env.TWITTER_CONSUMER_KEY,
        consumer_secret: process.env.TWITTER_CONSUMER_SECRET,
    });
}

async function getTweets(screenName: string) {
    return new Promise<Tweet[]>((resolve, reject) => {
        const result: Tweet[] = [];

        function getTweetsInternal(maxId?: number) {
            const options: GetUserTimeLineOptions = {
                count: 200,
                exclude_replies: false,
                include_rts: false,
                trim_user: true,
            };
            if (screenName !== undefined) {
                options.screen_name = screenName;
            }
            if (maxId !== undefined) {
                options.max_id = maxId;
            }

            client.get("statuses/user_timeline", options, (error, response: Tweet[]) => {
                if (error) {
                    reject(error);
                    return;
                }

                if (response.length === 0) {
                    resolve(result);
                    return;
                }

                const lastTweetId = lodash.last(response).id;
                console.log(`count=${response.length} lastTweetId=${lastTweetId}` );

                if (response.length === 1 && maxId === lastTweetId) {
                    resolve(result);
                }
                else {
                    for (const tweet of response) {
                        if (result.findIndex((t) => t.id === tweet.id) === -1) {
                            result.push(tweet);
                        }
                    }

                    getTweetsInternal(lastTweetId);
                }
            });
        }

        getTweetsInternal();
    });
}

function summarizeDailyTweetCount(tweets: Tweet[]): DailyTweetCount[] {
    const tweetsCreatedAtJst: Date[] = [];

    const JSTOffsetHours = 9;
    for (const tweet of tweets) {
        tweetsCreatedAtJst.push(DateFns.addHours(DateFns.parse(tweet.created_at), JSTOffsetHours));
    }

    const tweetsDate: string[] = tweetsCreatedAtJst.map((createdAt) => DateFns.format(createdAt, "YYYY-MM-DD"));
    const minDate: string = lodash.min(tweetsDate);
    const maxDate: string = lodash.max(tweetsDate);

    const result: DailyTweetCount[] = [];
    for (const day of DateFns.eachDay(minDate, maxDate)) {
        const key = DateFns.format(DateFns.addHours(day, JSTOffsetHours), "YYYY-MM-DD");
        result.push(new DailyTweetCount(key));
    }

    for (const tweetDate of tweetsDate) {
        const target = result.find((r) => r.date === tweetDate);
        if (target === undefined) {
            console.warn(`${tweetDate} is not in result`);
            continue;
        }

        target.count++;
    }

    return result;
}

function summarizeDayHourTweetCount(tweets: Tweet[]) {
    const tweetsCreatedAtJst: Date[] = [];

    const JSTOffsetHours = 9;
    for (const tweet of tweets) {
        tweetsCreatedAtJst.push(DateFns.addHours(DateFns.parse(tweet.created_at), JSTOffsetHours));
    }

    const result: Array<{ day, hours }> = [];
    for (const day of ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]) {
        const hours: Array<{day, hour, count}> = [];
        for (const hour of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23]) {
            hours.push({ day, hour, count: 0 });
        }

        const innerResult: { day, hours } = { day, hours };
        result.push(innerResult);
    }
    console.log(JSON.stringify(result, null, 4));

    for (const createdAt of tweetsCreatedAtJst) {
        console.log(`${createdAt}: day=${createdAt.getDay()}, hour=${createdAt.getHours()}`);
    }
}

(async () => {
    const tweets = await getTweets(Commander.screenName);

    if (Commander.createStub) {
        fs.writeFileSync("./stub.json", JSON.stringify(tweets, null, 4));
    }

    const result = summarizeDailyTweetCount(tweets);

    console.log(result);

    summarizeDayHourTweetCount(tweets);
})()
.catch(
    (error) => console.log(error)
);
