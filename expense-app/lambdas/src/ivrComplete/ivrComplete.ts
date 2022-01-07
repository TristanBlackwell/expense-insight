import { getISOWeek } from "date-fns";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { DynamoDB } from "aws-sdk";
import { v4 as uuidv4 } from "uuid";
import { Twilio } from "twilio";

const { ACCOUNT_SID, AUTH_TOKEN, SEND_TO, FROM_NUMBER } = process.env;

const dynamo = new DynamoDB.DocumentClient({ region: "eu-west-2" });

/* This is a Api Gateway triggered Lambda which takes the request sent at the end
of the Twilio Studio IVR which is initiated in `checkWeeksExpense`. The `target` value
is taken from the request and used to set the target for next weeks trigger. */
export const lambdaHandler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  if (!event.queryStringParameters || !event.queryStringParameters) {
    return {
      statusCode: 400,
      body: "Missing required 'target' parameter",
    };
  }
  const { target } = event.queryStringParameters;

  const twilioClient = new Twilio(ACCOUNT_SID, AUTH_TOKEN);

  // Target retrieved for this week, create this weeks row
  try {
    await dynamo
      .put({
        TableName: "expenses-log",
        Item: {
          year: new Date().getFullYear(),
          week: getISOWeek(new Date()),
          id: uuidv4(),
          target,
        },
      })
      .promise();
    return {
      statusCode: 200,
      body: "All good",
    };
  } catch (putErr) {
    console.error(`Add item failed: ${putErr}`);
    await twilioClient.messages.create({
      body: "Oops! I had an issue adding an new item... maybe worth checking the logs.",
      from: FROM_NUMBER,
      to: SEND_TO,
    });
    return {
      statusCode: 500,
      body: "Failed to add new item",
    };
  }
};
