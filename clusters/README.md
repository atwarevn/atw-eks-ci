**Install Flux**
```shell
brew install fluxcd/tap/flux
```
**Set permission to access Cluster**
```shell
eksctl create iamidentitymapping \
--cluster s-eks-ci  \
--region ap-northeast-1 \
--arn arn:aws:iam::234002441930:user/habac.jacie@atware.asia \
--group system:masters \
--no-duplicate-arns \
--username jacie \
--profile atwarevn-dev
```
```shell
flux get kustomizations --watch
flux get helmreleases --all-namespaces
flux logs --all-namespaces --level=error
flux delete helmrelease karpenter --namespace karpenter
kubectl delete helmrelease karpenter -n karpenter
```
```shell
flux create source helm karpenter \
  --url oci://public.ecr.aws/karpenter \
  --namespace karpenter \
  --export > ./clusters/karpenter/karpenter-source.yaml
```

```shell
flux create helmrelease karpenter --chart karpenter \
  --source HelmRepository/karpenter \
  --chart-version v0.27.3 \
  --namespace karpenter \
  --create-target-namespace \
  --export > ./clusters/karpenter/karpenter-release.yaml
```

# Troubleshooting
### Cluster Nodes got Unknown status
1. Check cluster endpoint in `karpenter-release.yaml`.
   ```shell
   export CLUSTER_NAME="s-eks-ci"
   export CLUSTER_ENDPOINT="$(aws eks describe-cluster --name ${CLUSTER_NAME} --query "cluster.endpoint" --output text --profile atwarevn-dev)"
   echo $CLUSTER_ENDPOINT
   ```
2. Delete Unknown-status nodes:
    ```shell
   kubectl delete node NODE_NAME
   ```
3. Test scaling
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
   ```shell
   kubectl scale deployment/inflate --replicas=5
   ```
