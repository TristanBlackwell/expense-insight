import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import {
  Configuration,
  PlaidApi,
  PlaidEnvironments,
  Transaction,
  TransactionsGetRequest,
} from "plaid";

const { PLAID_CLIENT_ID, PLAID_SECRET } = process.env;

/* This is a timer triggered Lambda designed to initiate the flow on the expense
tracker at a specific time each week. When started this function will calculate
the weeks expense, then pass off to Twilio to send a message. Twilio side will
handle some basic logic before passing back to another Lambda for logging */
export const lambdaHandler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  // const queries = JSON.stringify(event.queryStringParameters);
  // return {
  //   statusCode: 200,
  //   body: `Queries: ${queries}`,
  // };

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
  } catch (err) {
    console.error("Plaid transactions request failed!");
  }

  let totalSpend = 0;
  transactions.forEach((transaction) => {
    // Sum up all debit transactions, we only care about outgoings
    // so ignore - values.
    if (transaction.amount > 0) totalSpend += transaction.amount;
  });

  // Get target value and compare.

  // Send values off to Twilio for SMS
};
