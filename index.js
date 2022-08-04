const core = require('@actions/core')
const {HttpClient} = require('@actions/http-client')
const httpClient = new HttpClient()

async function run() {
    const accessTokenEndpoint = core.getInput('endpoint', {required: true})
    const repo = core.getInput('repo', {required: true})

    const accessToken = await httpClient.postJson(accessTokenEndpoint, {
        id_token: await core.getIDToken(accessTokenEndpoint),
        repo,
    }).then(res => {
        if (res.statusCode !== 200) throw new Error(res.result.error.message)
        return res.result
    })

    core.setSecret(accessToken.token)
    console.info(accessToken)
    core.exportVariable('GITHUB_ACCESS_TOKEN', accessToken.token)
    core.setOutput('token', accessToken.token)
}

run().catch(error => {
    core.setFailed(error.message);
})