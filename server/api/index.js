import express from 'express'
require('express-async-errors')

const jwt = require('jsonwebtoken')
const jwksClient = require('jwks-rsa')
const {Octokit} = require("@octokit/rest")
const {createAppAuth} = require("@octokit/auth-app")
const YAML = require('js-yaml')

// ---------------------------------------------------------------------------------------------------------------------

const GITHUB_ACTIONS_ISSUER = 'https://token.actions.githubusercontent.com'
const ACCESS_FILE_LOCATION = '.github/access.yaml'
const NODE_ENV = process.env.NODE_ENV

// ---------------------------------------------------------------------------------------------------------------------

const appOctokit = new Octokit({
    authStrategy: createAppAuth,
    auth: {
        appId: process.env.GITHUB_APP_ID,
        privateKey: process.env.GITHUB_APP_PRIVATE_KEY,
    }
})

// ---------------------------------------------------------------------------------------------------------------------

const app = express()
app.use(express.json())
app.post('/', async (request, response) => {
    const idTokenPayload = await verifyToken(request.body.id_token, {
        issuer: GITHUB_ACTIONS_ISSUER,
        ignoreExpiration: NODE_ENV === 'development' // for debugging only
    }).catch(err => {
        throw new ClientError(400, "token - " + err.message, err)
    })

    const sourceRepo = idTokenPayload.repository
    const targetRepo = request.body.repo !== 'self' ? request.body.repo : sourceRepo
    console.info('[INFO]', `Get access token for ${sourceRepo} to ${targetRepo}`)

    const appInstallation = await getAppInstallation({
        repo: targetRepo
    }).catch(err => {
        throw new ClientError(403, 'No permission granted', err)
    })

    const repoAccessPermissions = await getRepoAccessPermissions({
        appInstallation,
        repo: targetRepo,
        sourceRepo,
    })

    if (Object.entries(repoAccessPermissions).length === 0) {
        throw new ClientError(403, 'No permission granted');
    }

    const repoAccessToken = await getRepoAccessToken({
        appInstallation,
        repo: targetRepo,
        permissions: repoAccessPermissions,
    })

    response.json({
        repo: targetRepo,
        expires_at: repoAccessToken.expires_at,
        permissions: repoAccessToken.permissions,
        token: repoAccessToken.token,
    })
})

app.use(function errorHandler(err, req, res, _next) {
    if (err.name === 'ClientError') {
        console.debug('[DEBUG]', err)
        res.status(err.httpStatus)
        res.json({
            error: {
                name: err.name,
                message: err.message,
            }
        })
    } else {
        console.error('[ERROR]', err)
        res.status(500)
        res.json({
            error: {
                name: "InternalServerError",
                message: "Internal server error",
            }
        })
    }
})

export default app

// ---------------------------------------------------------------------------------------------------------------------

async function getRepoAccessToken(params) {
    const [_repoOwner, repoName] = params.repo.split('/')

    if (Object.entries(params.permissions).length === 0) {
        throw new Error('No permission requested');
    }

    const tokenResponse = await appOctokit.rest.apps.createInstallationAccessToken({
        installation_id: params.appInstallation.id,
        repositories: [repoName],
        permissions: params.permissions,
    })
    return tokenResponse.data
}

async function getAppInstallation(params) {
    const [repoOwner, repoName] = params.repo.split('/')
    const installationResponse = await appOctokit.rest.apps.getRepoInstallation({
        owner: repoOwner,
        repo: repoName,
    })
    return installationResponse.data
}

function filterValidPermissions(permissions, eligiblePermissions) {
    const validPermissions = {}
    for (const [scope, permission] of Object.entries(permissions)) {
        if (isValidPermission(permission, eligiblePermissions[scope])) {
            validPermissions[scope] = permission
        }
    }
    return validPermissions
}

function isValidPermission(permission, grantedPermission) {
    const validPermissions = ['write', 'read']
    if (!validPermissions.includes(permission)) return false
    if (!validPermissions.includes(grantedPermission)) return false
    if (permission === grantedPermission) return true
    return grantedPermission === 'write'
}

async function getRepoAccessPermissions(params) {
    const repoAccessConfig = await getRepoAccessConfig({
        appInstallation: params.appInstallation,
        repo: params.repo,
    })
    if (!repoAccessConfig || repoAccessConfig.self !== params.repo) {
        return []
    }

    const repoAccessPolicy = repoAccessConfig.policies.find(policy => {
        if (policy.repo === 'self' && params.sourceRepo === params.repo) return true

        const policyRepoPattern = escapeStringRegexp(policy.repo).replaceAll('\\*', '.*').replaceAll('\\?', '.')
        const policyRepoRegExp = new RegExp(`^${policyRepoPattern}$`)
        return policyRepoRegExp.test(params.sourceRepo)
    })
    if (!repoAccessPolicy) {
        return []
    }

    return filterValidPermissions(repoAccessPolicy.permissions, params.appInstallation.permissions);
}

async function getRepoAccessConfig(params) {
    // create access token to read .github/access.yaml file
    const appRepoAccessToken = await getRepoAccessToken({
        appInstallation: params.appInstallation,
        repo: params.repo,
        permissions: {single_file: "read"},
    })

    const appRepoOctokit = new Octokit({auth: appRepoAccessToken.token})
    const [repoOwner, repoName] = params.repo.split('/')
    let repoAccessFileResponse
    try {
        repoAccessFileResponse = await appRepoOctokit.repos.getContent({
            owner: repoOwner, repo: repoName, path: ACCESS_FILE_LOCATION
        })
    } catch (err) {
        return
    }
    return YAML.load(Buffer.from(repoAccessFileResponse.data.content, 'base64'))

}

async function verifyToken(token, options) {

    function getKey(header, callback) {
        jwksClient({jwksUri: `${options.issuer}/.well-known/jwks`})
            .getSigningKey(header.kid, (err, key) => {
                callback(null, key.publicKey)
            })
    }

    return new Promise((resolve, reject) =>
        jwt.verify(token, getKey, options,
            (err, decoded) => err ? reject(err) : resolve(decoded)
        )
    )
}

// source: https://www.npmjs.com/package/escape-string-regexp
function escapeStringRegexp(string) {
    // Escape characters with special meaning either inside or outside character sets.
    // Use a simple backslash escape when it’s always valid, and a `\xnn` escape when the simpler form would be disallowed by Unicode patterns’ stricter grammar.
    return string
        .replace(/[|\\{}()[\]^$+*?.]/g, '\\$&')
        .replace(/-/g, '\\x2d');
}

function ClientError(httpStatus, message, cause) {
    if (httpStatus < 400 || httpStatus >= 500) {
        throw Error(`invalid client error status ${httpStatus}`)
    }

    this.name = this.constructor.name;
    this.message = message;
    this.httpStatus = httpStatus;
    this.cause = cause
}

