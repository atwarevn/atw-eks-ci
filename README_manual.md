# Prerequisite
### Setup eksctl
```shell
brew upgrade eksctl && { brew link --overwrite eksctl; } || { brew tap weaveworks/tap; brew install weaveworks/tap/eksctl; }
```
### Setup flux
```shell
brew install fluxcd/tap/flux
```
### Setup helm
```shell
brew install helm
```
# Steps

## Setup ENV
```shell
export KARPENTER_VERSION=v0.27.3
export CLUSTER_NAME="s-eks-ci"
export AWS_DEFAULT_REGION="ap-northeast-1"
export AWS_ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text --profile atwarevn-dev)"
export TEMPOUT=$(mktemp)
echo $KARPENTER_VERSION $CLUSTER_NAME $AWS_DEFAULT_REGION $AWS_ACCOUNT_ID $TEMPOUT
```

## Create EKS Cluster

### Create IAM Roles, User Profile for Karpenter 
```shell
curl -fsSL https://karpenter.sh/"${KARPENTER_VERSION}"/getting-started/getting-started-with-karpenter/cloudformation.yaml  > $TEMPOUT \
&& aws cloudformation deploy \
  --stack-name "${CLUSTER_NAME}-karpenter" \
  --template-file "${TEMPOUT}" \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides "ClusterName=${CLUSTER_NAME}" \
  --profile atwarevn-dev
```

### Create Cluster
```shell
eksctl create cluster --profile atwarevn-dev -f - <<EOF
---
apiVersion: eksctl.io/v1alpha5
kind: ClusterConfig
metadata:
  name: ${CLUSTER_NAME}
  region: ${AWS_DEFAULT_REGION}
  version: "1.25"
  tags:
    karpenter.sh/discovery: ${CLUSTER_NAME}

iam:
  withOIDC: true
  serviceAccounts:
  - metadata:
      name: karpenter
      namespace: karpenter
    roleName: ${CLUSTER_NAME}-karpenter
    attachPolicyARNs:
    - arn:aws:iam::${AWS_ACCOUNT_ID}:policy/KarpenterControllerPolicy-${CLUSTER_NAME}
    roleOnly: true

iamIdentityMappings:
- arn: "arn:aws:iam::${AWS_ACCOUNT_ID}:role/KarpenterNodeRole-${CLUSTER_NAME}"
  username: system:node:{{EC2PrivateDNSName}}
  groups:
  - system:bootstrappers
  - system:nodes

managedNodeGroups:
- instanceType: t3.small
  amiFamily: AmazonLinux2
  name: ${CLUSTER_NAME}-ng
  volumeSize: 16
  ssh:
    enableSsm: true
  desiredCapacity: 3
  minSize: 1
  maxSize: 5
EOF
```

```shell
export CLUSTER_ENDPOINT="$(aws eks describe-cluster --name ${CLUSTER_NAME} --query "cluster.endpoint" --output text --profile atwarevn-dev)"
export KARPENTER_IAM_ROLE_ARN="arn:aws:iam::${AWS_ACCOUNT_ID}:role/${CLUSTER_NAME}-karpenter"

echo $CLUSTER_ENDPOINT $KARPENTER_IAM_ROLE_ARN
aws iam create-service-linked-role --aws-service-name spot.amazonaws.com || true
```
```shell
aws eks --region ap-northeast-1 update-kubeconfig --name s-eks-ci --profile atwarevn-dev
```

## Create Karpenter for auto-scaling
```shell
helm upgrade --install karpenter oci://public.ecr.aws/karpenter/karpenter --version ${KARPENTER_VERSION} --namespace karpenter --create-namespace \
  --set serviceAccount.annotations."eks\.amazonaws\.com/role-arn"=${KARPENTER_IAM_ROLE_ARN} \
  --set settings.aws.clusterName=${CLUSTER_NAME} \
  --set settings.aws.defaultInstanceProfile=KarpenterNodeInstanceProfile-${CLUSTER_NAME} \
  --set settings.aws.interruptionQueueName=${CLUSTER_NAME} \
  --wait
```

### Create Karpenter Provisioning
```shell
cat <<EOF | kubectl apply -f -
apiVersion: karpenter.sh/v1alpha5
kind: Provisioner
metadata:
  name: karpenter
spec:
  requirements:
    - key: karpenter.sh/capacity-type
      operator: In
      values: ["spot", "on-demand"]
    - key: "topology.kubernetes.io/zone"
      operator: In
      values: ["ap-northeast-1a", "ap-northeast-1c"]
    - key: "kubernetes.io/arch"
      operator: In
      values: ["amd64"]
    - key: "node.kubernetes.io/instance-type"
      operator: In
      values: ["t3.small", "t3.medium"]
  limits:
    resources:
      cpu: 100
      memory: 100Gi
  providerRef:
    name: karpenter
  ttlSecondsAfterEmpty: 30
---
apiVersion: karpenter.k8s.aws/v1alpha1
kind: AWSNodeTemplate
metadata:
  name: karpenter
spec:
  subnetSelector:
    karpenter.sh/discovery: ${CLUSTER_NAME}
  securityGroupSelector:
    karpenter.sh/discovery: ${CLUSTER_NAME}
EOF
```
### Test scaling
```shell
cat <<EOF | kubectl apply -f -
apiVersion: apps/v1
kind: Deployment
metadata:
  name: inflate
spec:
  replicas: 0
  selector:
    matchLabels:
      app: inflate
  template:
    metadata:
      labels:
        app: inflate
    spec:
      terminationGracePeriodSeconds: 0
      containers:
        - name: inflate
          image: public.ecr.aws/eks-distro/kubernetes/pause:3.7
          resources:
            requests:
              cpu: 1
EOF
```

## Setup Github Action Runner Controller

### Setup Cert Manager
```shell
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.8.2/cert-manager.yaml
kubectl create namespace actions-runner-system

kubectl create secret generic controller-manager \
    -n actions-runner-system \
    --from-literal=github_token=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
```

### Auto-scaling Runner
Ref: https://github.com/actions/actions-runner-controller/blob/master/docs/automatically-scaling-runners.md#webhook-driven-scaling
1. Create ALB for configuring webhook event from Github
2. Target from Target group to the local ip address of the webhook
3. Update security group of the EKS cluster for ALB can see the webhook (and the GHE)


### Add helm config for action runners
```shell
helm repo add actions-runner-controller https://actions-runner-controller.github.io/actions-runner-controller

helm upgrade --install --namespace actions-runner-system --create-namespace --values action-controller-values.yaml \
  --wait actions-runner-controller actions-runner-controller/actions-runner-controller
```

### Create runner
```shell
kubectl apply -f runner.yaml
kubectl get runners -A
```


## Setup Flux for automated sync cluster configuration
```shell
export GITHUB_TOKEN=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
export GITHUB_USER=jack.harrison@atware.asia

flux bootstrap git \
  --url=https://github.com/atwarevn/atw-eks-ci \
  --username=jack.harrison@atware.asia \
  --password=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 \
  --token-auth=true \
  --path=./clusters
```
```shell
flux create source helm actions-runner-controller --url https://actions-runner-controller.github.io/actions-runner-controller

flux create hr actions-runner-controller \
    --source=HelmRepository/actions-runner-controller \
    --chart=actions-runner-controller \
    --values=./action-controller-values.yaml
```
## Setup Dashboard
```shell
kubectl apply -f https://raw.githubusercontent.com/kubernetes/dashboard/v2.6.0/aio/deploy/recommended.yaml
kubectl proxy --port=8080 --address=0.0.0.0 --disable-filter=true &
aws eks get-token --cluster-name ${CLUSTER_NAME}  --profile atwarevn-dev | jq -r '.status.token'
```

