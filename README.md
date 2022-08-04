# GitHub Actions Access Manager

## Usage
### Install Access Manager App to Your Target Repositories
* Install [Access Manger App](https://github.com/apps/access-manager-for-github-actions)
* **or** [Deploy and Install your **Own** GitHub App](#Deploy-your-own-Access-Manager-App)

### Configure Access Permissions for Target Repository
* Create `.github/access.yaml` file
* Set `self` to enclosing repository. 
  * This ensures no unintended access in case you fork a repository with `.github/access.yaml` file.  
* Add policies and [permissions](https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions#permissions), see examples below.
##### Example configurations
* Grant read access to GitHub Packages
  ```yaml
  self: example/test
  policies:
  - repo: example/sandbox
    permissions:
      packages: read
  ```
* Self access to trigger workflows from another workflow
  ```yaml
  self: example/test
  policies:
  - repo: self
    permissions:
      actions: write
  ```

### Setup GitHub Action Workflow
```yaml
# ...
permissions:
  id-token: write # required to request id-token
  
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: qoomon/github-actions-access-manager@main
        id: github-actions-access
        with:
          repo: example/test
      - name: Utilize access token by environment variable
        run: echo $GITHUB_ACCESS_TOKEN
      - name: Utilize access token by step output value
        run: echo ${{ steps.github-actions-access.outputs.token }}
      - name: Use access token to clone repository
        run: |
          git config --global credential.helper store
          git clone https://_:$GITHUB_ACCESS_TOKEN@github.com/example/test.git
```

## Deploy your own Access Manager App

###  Create a GitHub App
* Create a [new User App](https://github.com/settings/apps/new) or a [new Organizations App](https://github.com/organizations/YOUR_ORGANIZATION/settings/apps/new)
* Fill out mandatory fields
* Deactivate Webhook
* Choose `Repository permissions` you want to manage or see following suggestions
    * Actions: `Read and write`
    * Contents: `Read-only`
    * Packages: `Read-only`
* Add Mandatory `Repository permissions`
    * Single file: `Read-only`
        * Add file path `.github/access.yaml`

### Install GitHub App for Target Repository
* Go to [User App Settings](https://github.com/settings/apps/new) or [Organizations App Settings](https://github.com/organizations/YOUR_ORGANIZATION/settings/apps)
* Click on `Edit` of your App
* Click on `Install App`
* Choose an account to install your app to

### Run GitHub Actions Access Manager Server
* Vercel TODO
  * see [server](server/) code
  * TODO
* Docker Container
  * TODO
* AWS Lambda
  * TODO

## Development
#### Run Server Locally
* Start Server
  ```shell
  cd server/
  npm start
  ```
* Request Access Token
  ```shell 
  http POST localhost:3000 token=${github_id_token} repo=${target_repo}`
  ```

## Resources
* App icon: https://img.icons8.com/cotton/256/000000/grand-master-key.png
