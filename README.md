<div style="text-align: center;">

![Expense Insight](/docs/images/expense-insight.PNG)

</div>

# Expense Insight

Expense Insight is a small program to help notify you of your weekly spending via a short SMS message.

# Usage

Once set up, the program will send you a weekly message at 10AM on Monday to notify of your spend for the previous week. Comparing your actual versus budgeted.

You will then also be asked if you would like to alter the budget for the current week or remain the same.

Each week is stored in DynamoDB making it possible to view the history. This could also be extracted for further analysis.

> NOTE: There is likely to be a cost associated with running this. The AWS bits are well within the free tier but you know best as to whether you have other existing resources. Twilio Studio & sending SMS has some very marginal fees but is worth noting.

## Installation

The application is made up of two main parts.

An AWS 'backend' involving Lambda's, DynamoDB and API Gateway, responsible for calculating actual vs budgeted spend, triggering your weekly message and storing history. See `/expense-app/README.md`

A Twilio Studio IVR 'flow' which sends your weekly message and asks if you would like to change or keep your current target before passing back to a Lambda to finish up. See `/studio/README.md`

## Stack

- AWS - Orchestration, computation, and storage of past results.
- Twilio - Studio IVR flow to send SMS and take in any newly set target to pass back to AWS.
- Plaid - Handles the connection to a chosen bank account to retrieve the weekly spend for calculations.

> You will need accounts for these services for this app to work.

## Contributing

Pull requests are welcome for any additions you may have.

For any bugs/fixes, please open an issue first to discuss what you would like to change.

## License

[MIT](https://choosealicense.com/licenses/mit/)
