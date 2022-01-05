import { DynamoDB } from "aws-sdk";
import {
  Configuration,
  PlaidApi,
  PlaidEnvironments,
  Transaction,
  TransactionsGetRequest,
} from "plaid";
import { getISOWeek } from "date-fns";
import { Twilio } from "twilio";

const {
  PLAID_CLIENT_ID,
  PLAID_SECRET,
  ACCOUNT_SID,
  AUTH_TOKEN,
  SEND_TO,
  FROM_NUMBER,
} = process.env;

const dynamo = new DynamoDB.DocumentClient();

/* This is a timer triggered Lambda designed to initiate the flow on the expense
tracker at a specific time each week. When started this function will calculate
the weeks expense, then pass off to Twilio to send a message. Twilio side will
handle some basic logic before passing back to another Lambda for logging */
export const lambdaHandler = async (): Promise<void> => {
  const twilioClient = new Twilio(ACCOUNT_SID, AUTH_TOKEN);

  const configuration = new Configuration({
    basePath: PlaidEnvironments.sandbox,
    baseOptions: {
      Headers: {
        "PLAID-CLIENT-ID": PLAID_CLIENT_ID,
        "PLAID-SECRET": PLAID_SECRET,
      },
    },
  });
  const plaidClient = new PlaidApi(configuration);

  const today = new Date();
  const oneWeekAgo = new Date(new Date().setDate(today.getDate() - 7));

  // Our dates need to be in string format YYYY-MM-DD for Plaid request.
  const todayString = `${today.getFullYear().toString()}-${today
    .getMonth()
    .toString()}-${today.getDate().toString()}`;
  const oneWeekAgoString = `${oneWeekAgo.getFullYear().toString()}-${oneWeekAgo
    .getMonth()
    .toString()}-${oneWeekAgo.getDate().toString()}`;

  const request: TransactionsGetRequest = {
    access_token: "",
    start_date: oneWeekAgoString,
    end_date: todayString,
  };

  const transactions: Transaction[] = [];
  try {
    const transactionResponse = await plaidClient.transactionsGet(request);

    transactions.concat(transactionResponse.data.transactions);
    const totalTransactions = transactionResponse.data.total_transactions;

    // If we couldn't get all the transaction items on the first request
    // lets paginate our request.
    const moreTransactionRequests = [];
    while (transactions.length < totalTransactions) {
      const paginatedRequest: TransactionsGetRequest = {
        ...request,
        options: {
          offset: transactions.length,
        },
      };

      moreTransactionRequests.push(
        plaidClient.transactionsGet(paginatedRequest)
      );
    }

    const moreTransactions = await Promise.all(moreTransactionRequests);

    moreTransactions.forEach((mtxs) => {
      transactions.concat(mtxs.data.transactions);
    });
  } catch (plaidError) {
    console.error(`Plaid transactions request failed: ${plaidError}`);
    await twilioClient.messages.create({
      body: "Oops! I had an issue getting to Plaid... maybe worth checking the logs.",
      from: FROM_NUMBER,
      to: SEND_TO,
    });
    return;
  }

  let totalSpend = 0;
  transactions.forEach((transaction) => {
    // Sum up all debit transactions, we only care about outgoings
    // so ignore - values.
    if (transaction.amount > 0) totalSpend += transaction.amount;
  });

  try {
    await dynamo.get(
      {
        TableName: "Expenses Log",
        Key: {
          Year: oneWeekAgo.getFullYear(),
          Week: getISOWeek(oneWeekAgo),
        },
        ProjectionExpression: "year, week, account, target",
      },
      async (getErr, data) => {
        if (getErr || !data.Item) {
          console.error(`Retrieval failed: ${getErr}`);
          await twilioClient.messages.create({
            body: "Oops! I had an issue getting the latest expenses... maybe worth checking the logs.",
            from: FROM_NUMBER,
            to: SEND_TO,
          });
          return;
        }

        const budgetted = data.Item.target;
        const difference = totalSpend - budgetted;

        let inBudget = false;
        if (difference > 0) {
          inBudget = true;
        }

        // Update last weeks row now we have the actual spend & difference
        await dynamo.update(
          {
            TableName: "Expenses Log",
            Key: {
              Year: data.Item.year,
              Week: data.Item.week,
            },
            UpdateExpression:
              "set executed_at = :ea, actual = :a, difference = :d",
            ExpressionAttributeValues: {
              ":ea": new Date(),
              ":a": totalSpend,
              ":d": difference,
            },
            ReturnValues: "NONE",
          },
          (updateErr) => {
            if (updateErr) {
              console.error(`update failed: ${updateErr}`);
              throw new Error("update failed");
            }
          }
        );

        // Let's create a studio flow execution which will send the
        // information to the user & ask for any changes.
        try {
          twilioClient.studio.flows("sid").executions.create({
            to: SEND_TO,
            from: FROM_NUMBER,
            parameters: {
              inBudget,
              difference,
            },
          });
        } catch (studioError) {
          console.error(
            `Failed to create studio flow execution: ${studioError}`
          );
          await twilioClient.messages.create({
            body: "Oops! I had an issue creating a new flow execution... maybe worth checking the logs.",
            from: FROM_NUMBER,
            to: SEND_TO,
          });
        }
      }
    );
  } catch (dynamoError) {
    await twilioClient.messages.create({
      body: "Oops! something went wrong with Dynamo... maybe worth checking the logs.",
      from: FROM_NUMBER,
      to: SEND_TO,
    });
  }
};
